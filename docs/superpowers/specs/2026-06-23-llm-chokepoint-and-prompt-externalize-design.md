# `@awecode/llm` as the single AI SDK chokepoint + externalize the base system prompt

**Date:** 2026-06-23
**Status:** Approved after brainstorming (3 sections reviewed sequentially)
**Related:** Architecture review (in-session), [ADR-0007 — Extract ProtocolSession](../../adr/0007-extract-protocol-session.md)

## Goal

Three coupled refactors that share one architectural intent: **`@awecode/llm` becomes the only package that knows about the Vercel AI SDK, and the agent's base system prompt becomes an editable asset instead of inline source.**

1. **Externalize `DEFAULT_SYSTEM_PROMPT`** out of `packages/agent/src/chat.ts` into `packages/agent/prompts/system.md`.
2. **Make `@awecode/llm` the single chokepoint** for the AI SDK by adding a streaming-with-tools API the core loop can actually use (instead of bypassing `llm` and calling `streamText` directly).
3. **Move the AI SDK adapters** (`buildToolSet`, `normalizeToolCall`) out of `agent/chat.ts` into `@awecode/llm`, so the agent stops importing from `ai`.

## Motivation (evidence from the codebase)

Three call sites currently re-implement the same `resolveProviderConfig → createProvider → call SDK` pattern, each carrying its own copy of the AI SDK v6 migration quirks (`inputTokens` vs `promptTokens`, `inputSchema` vs `parameters`, `TypedToolCall.input` vs `args`):

- `packages/agent/src/chat.ts:206-213` — `streamText` (core chat loop, bypasses llm)
- `packages/agent/src/context/compact.ts:56-61` — `generateText` (compaction)
- `packages/llm/src/chat.ts:82-88, 119-125` — the intended chokepoint, but too thin to serve the tool-using loop

Bug fixes for any v6 quirk must be applied in three places; the "abstraction" in `@awecode/llm` exists but is bypassed for the most important call path. Meanwhile the base system prompt — a behavior/persona contract, not control flow — is inlined inside the chat loop function, while the workflow package correctly externalizes its persona prompts as `SKILL.md` assets. Same concern, two inconsistent treatments.

## Constraints (user-accepted during brainstorming)

- **Scope of prompt externalization:** base prompt only. `SUMMARIZATION_PROMPT` in `compact.ts` stays inline (internal, not a persona/behavior contract).
- **Backward compatibility:** keep the `DEFAULT_SYSTEM_PROMPT` export as an inline-string fallback so loaders that can't read the file still get a value and existing tests asserting the export keep passing.
- **API parity:** `streamChatWithTools` keeps an `onToken` callback (mirrors current `ChatLoopOptions.onToken`), because `ProtocolSession` needs to emit wire `token` events on each chunk. A raw `textStream` escape hatch is provided as a secondary access path; `onToken` is the primary one.
- **No behavior change:** the text emitted to providers, the streaming token flow, and the tool-call/tool-result shape all stay identical. This is a pure relocation refactor.
- **No new cross-package dependencies.** `@awecode/llm` must not gain a dependency on `@awecode/tools` (or any other awecode package); doing so would couple an infra-leaf package to a domain-leaf and risk a future cycle. `buildToolSet` takes a local structural type instead (see Components / Open Question resolution). The only external import added is `ai`, which `@awecode/llm` already depends on.

## Non-goals

- Changing the wire protocol (`GuiAgentEvent` / `GuiClientCommand`).
- Changing how `chat` / `streamChat` (text-only) work — they keep serving `chat-test` and e2e tests unchanged.
- Cutting the `gui → llm` edge or untangling the `agent ↔ orchestrator` dynamic-import cycle. Those are separate architecture items flagged in the review but out of scope here.
- Refactoring `agent/context/compact.ts`'s prompt content; only its SDK call site changes to go through `@awecode/llm`.
- Adding an ESLint rule to ban `import 'ai'` outside llm (follow-up; not required to land the refactor).

---

## Architecture

### Dependency direction (target)

```
                 ┌─────────────────────────────┐
                 │   @awecode/llm              │
                 │   (ONLY importer of 'ai')   │
                 │   - chat / streamChat       │
                 │   - streamChatWithTools     │
                 │   - buildToolSet            │
                 │   - normalizeToolCall       │
                 └──────────────┬──────────────┘
                                │
        ┌───────────────────────┼────────────────────────┐
        ▼                       ▼                        ▼
  @awecode/agent          @awecode/cli (chat-test)   (future)
  - chat.ts  (loop)       - uses streamChat only
  - compact.ts            (text-only, unchanged)
```

**Enforced rule:** after this refactor, no package other than `@awecode/llm` imports from `ai` or `@ai-sdk/*`. The ban is policed by review (and optionally by a follow-up ESLint `no-restricted-imports` rule).

### Module map (target)

```
packages/llm/src/
  chat.ts            (unchanged: chat, streamChat — text-only)
  adapter.ts         (NEW: buildToolSet + normalizeToolCall + types)
  stream-tools.ts    (NEW: streamChatWithTools + StreamWithToolsResult)
  index.ts           (export the two new modules)

packages/agent/
  prompts/           (NEW: asset dir, sibling of src/ and dist/)
    system.md        (NEW: the base prompt content, verbatim from chat.ts)
  src/chat.ts        (no longer imports 'ai'; calls llm)
  src/context/compact.ts  (calls llm instead of 'ai')
```

`prompts/` is shipped as a filesystem asset via the `exports` map, mirroring the proven `@awecode/workflow` skills pattern (`"./skills/*": "./skills/*"`):

```json
"exports": {
  ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
  "./prompts/*": "./prompts/*"
}
```

### Path resolution for `system.md` — Option A (single relative path)

`prompts/` is a sibling of **both** `src/` and `dist/` under `packages/agent/`. From either `src/chat.ts` (dev, run via tsx/vitest) or `dist/chat.js` (built), going up **one** level reaches `packages/agent/`, so a single relative path works in both modes. This is the exact topology that `@awecode/workflow`'s `getBuiltInSkillsDir()` already relies on in production.

Rejected alternatives:
- **Two-path probe with `existsSync`** — the "dev path" candidate (`../../prompts`) was based on the false premise that `src/chat.ts` sits two levels below the package root; it doesn't. The second path is dead *and* wrong (resolves to `.../packages/prompts/`).
- **`NODE_ENV` branch** — `NODE_ENV` is frequently unset in dev/monorepo; combined with the wrong fallback path, it's both fragile and buggy.
- **Bundle the `.md` into JS via a tsup loader** — defeats the externalization goal (no hot-edit, no `./prompts/*` subpath export) and diverges from the workflow precedent.

---

## Components

### `packages/llm/src/adapter.ts` (new)

Two pure functions, no side effects. Moved verbatim from `agent/chat.ts:109-156`.

`buildToolSet` accepts a **local structural type** (`AdapterToolDefinition`) rather than importing `ToolDefinition` from `@awecode/tools`. This keeps `@awecode/llm` dependency-free of other awecode packages. The real `ToolDefinition` from `@awecode/tools` (`{ name, description, parameters }`) satisfies the structural type automatically, so callers pass concrete definitions with no cast.

```ts
import { jsonSchema, type ToolSet } from 'ai';

/**
 * Structural subset of @awecode/tools' ToolDefinition that buildToolSet
 * actually reads. Declared locally so @awecode/llm doesn't depend on
 * @awecode/tools. The real ToolDefinition satisfies this structurally.
 */
export interface AdapterToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface NormalizedToolCall {
  name: string;
  arguments: Record<string, unknown>;
  id?: string;
}

export function buildToolSet(defs: AdapterToolDefinition[]): ToolSet;

export function normalizeToolCall(call: {
  toolName: string;
  input?: unknown;
  args?: unknown;
  toolCallId?: string;
}): NormalizedToolCall;
```

### `packages/llm/src/stream-tools.ts` (new)

Encapsulates the streaming-with-tools pattern the agent currently hand-rolls.

```ts
import type { ModelMessage } from 'ai';
import type { AwecodeConfig } from './types.js';
import type { ToolSet } from 'ai';
import type { NormalizedToolCall } from './adapter.js';

export interface StreamWithToolsOptions {
  config: AwecodeConfig;
  messages: ModelMessage[];
  tools: ToolSet;
  system: string;
  maxOutputTokens?: number;
  abortSignal?: AbortSignal;
  modelOverride?: string;
  onToken?: (chunk: string) => void;
}

export interface StreamWithToolsResult {
  textStream: AsyncIterable<string>;
  toCompletion(): Promise<{
    assistantText: string;
    toolCalls: NormalizedToolCall[];
  }>;
}

export async function streamChatWithTools(
  opts: StreamWithToolsOptions,
): Promise<StreamWithToolsResult>;
```

Internals:
- Resolve provider config (reuse the existing `resolveProviderConfig` helper in `llm/chat.ts` — extract to shared internal if not already).
- `createProvider(config, opts.modelOverride)`.
- `streamText({ model, messages, system, tools, maxOutputTokens, abortSignal })`.
- `textStream` exposed for callers that want to iterate directly.
- `toCompletion()` drains `textStream` (accumulating into `assistantText` and calling `onToken` per chunk), awaits `result.toolCalls`, and returns `{ assistantText, toolCalls: toolCalls.map(normalizeToolCall) }`.

### `packages/agent/prompts/system.md` (new)

Exact string content of `DEFAULT_SYSTEM_PROMPT` from `chat.ts:68-88`, as Markdown (no front-matter — it's not a skill, just a prompt body).

### `packages/agent/src/chat.ts` (refactored)

- Remove `import { streamText, jsonSchema, ... } from 'ai'`.
- Add `import { streamChatWithTools } from '@awecode/llm'`.
- Keep `DEFAULT_SYSTEM_PROMPT` export as the inline-string fallback (per backward-compat constraint).
- Add `getSystemPromptPath()` (parity with `getBuiltInSkillsDir()` in workflow) + module-level `loadSystemPrompt()` + cached `SYSTEM_PROMPT` constant.
- In `runChatLoop`, replace the `streamText` block with a single `streamChatWithTools({ ... })` call, then `await result.toCompletion()`. The downstream logic (diff detection, intent, tool dispatch, context tracking) operates on the returned `{ assistantText, toolCalls }` — shape unchanged.
- `buildToolSet` / `normalizeToolCall` local definitions deleted; `chat.ts` consumes them via the llm API (the tool set is built once before the loop, same as today).

### `packages/agent/src/context/compact.ts` (refactored)

- Remove `import { generateText } from 'ai'`.
- Use the existing `chat()` from `@awecode/llm` (text-only, non-streaming) — which already wraps `generateText` and normalizes usage. The compaction prompt becomes the `system`, the conversation text becomes the `prompt`. This is the smallest change that removes the direct `ai` import.

---

## Data flow (chat loop, post-refactor)

```
ProtocolSession.handlePrompt
  └─ runChatLoop(messages, opts)
       ├─ buildToolSet(listToolDefinitions())   [from @awecode/llm]
       ├─ streamChatWithTools({ config, messages, tools, system: SYSTEM_PROMPT, onToken, abortSignal })
       │     │  (inside @awecode/llm — the ONLY place 'ai' is imported)
       │     └─ streamText → textStream + toolCalls
       └─ result.toCompletion()
            → { assistantText, toolCalls: NormalizedToolCall[] }
       └─ (unchanged) detect diff, dispatch tools, push messages, fire callbacks
```

Token chunks still flow to `ProtocolSession` via the `onToken` callback → `emit({ type: 'token', chunk })`. Wire protocol and UI behavior are identical.

---

## Error handling

Identical to today. Specifically:
- `streamChatWithTools` surfaces provider errors on first `await` (same as the current `await streamText(...)` line). Callers' existing try/catch around `runChatLoop` is unchanged.
- The "no output generated" guard (empty `assistantText` AND empty `toolCalls`) stays in `agent/chat.ts`, operating on the `toCompletion()` return value — it's domain-level detection, not SDK glue, so it correctly stays in the agent.
- `loadSystemPrompt()` swallows read errors and falls back to `DEFAULT_SYSTEM_PROMPT`. The fallback is logged once via `console.warn` so a missing/mis-placed prompt file in dev is visible without breaking the loop.

## Testing

- **`packages/llm/tests/adapter.test.ts`** (new) — unit tests for `buildToolSet` and `normalizeToolCall`, moved from their current implicit coverage in `agent/tests/chat.test.ts`. Covers both v6 `input` and legacy `args` shapes for tool calls.
- **`packages/llm/tests/stream-tools.test.ts`** (new) — `streamChatWithTools` with a mock provider; asserts `onToken` fires per chunk, `toCompletion()` returns accumulated text + normalized tool calls, abort signal is forwarded. Reuses the mock-config pattern from `llm/tests/chat.test.ts`.
- **`packages/agent/tests/chat.test.ts`** (updated) — existing tests keep passing; the `streamText` mock is replaced by a `streamChatWithTools` mock via `opts.runChatLoop` injection in `ProtocolSession`, or by mocking `@awecode/llm/stream-tools`. The empty-output guard test stays.
- **`packages/agent/tests/system-prompt.test.ts`** (new) — asserts `getSystemPromptPath()` resolves to an existing file, the file's content equals `DEFAULT_SYSTEM_PROMPT` (drift guard), and `loadSystemPrompt()` returns the file content.
- **Existing e2e + chat-test tests** — unchanged; `chat`/`streamChat` in llm are untouched.

## Rollout

Implementation plan (written separately via the writing-plans skill) will sequence three independently-verifiable tasks matching the three refactor goals:

1. Add `prompts/system.md` + loader in `agent/chat.ts` (atomic, no llm dependency).
2. Add `adapter.ts` + `stream-tools.ts` to `@awecode/llm` + exports (additive, no consumer changes yet).
3. Switch `agent/chat.ts` and `agent/context/compact.ts` to consume llm; remove their `ai` imports (the cutover).

Each task ends green (typecheck + tests). Task 2 and 3 are sequenced (3 depends on 2) but 1 is independent and can land first or last.

## Resolved design questions

1. **Where does `ToolDefinition` live so `@awecode/llm` can import it without creating a cycle?**
   - **Resolved: local structural type in `llm/adapter.ts`.** The real `ToolDefinition` (`packages/tools/src/types.ts:15-19`) is a flat 3-field interface (`name`, `description`, `parameters`) with no cross-package references. Options evaluated:
     - (a) Add dep `@awecode/llm → @awecode/tools` — **rejected**: couples an infra-leaf to a domain-leaf and risks a future cycle if `tools` ever needs `llm`. Also violates the "no new cross-package dependencies" constraint.
     - (b) Move `ToolDefinition` into `@awecode/llm` — **rejected**: reverses the currently-clean `tools` ownership and forces `@awecode/tools` to depend on `@awecode/llm` for its own type.
     - (c) Local structural type — **accepted**: `buildToolSet` accepts `AdapterToolDefinition[]` with the same 3 fields; the real `ToolDefinition` satisfies it structurally with zero cast. No cross-package dep. This mirrors how `adaptToolHandler` in `@awecode/tools` already uses local structural typing to avoid importing consumer types.
