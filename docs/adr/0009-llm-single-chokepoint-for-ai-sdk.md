# `@awecode/llm` as the single AI SDK chokepoint

## Status

Accepted (2026-06-23)

## Context

Before this ADR, the Vercel AI SDK (`ai` package + `@ai-sdk/*` providers) was
imported directly from three call sites, each re-implementing the same
`resolveProviderConfig → createProvider → call SDK` pattern and each carrying
its own copy of the AI SDK v6 migration quirks:

- `packages/agent/src/chat.ts` — `streamText` (core chat loop)
- `packages/agent/src/context/compact.ts` — `generateText` (context compaction)
- `packages/llm/src/chat.ts` — `generateText` / `streamText` (the intended
  chokepoint, but too thin to serve the tool-using loop)

Concrete pain:

- `buildToolSet` (wrapping raw JSON Schema in AI SDK v6's `jsonSchema()`
  helper) and `normalizeToolCall` (reading the v6 `input` field with legacy
  `args` fallback) lived as private helpers inside `agent/chat.ts`. Every
  consumer of the agent package implicitly depended on AI SDK version
  details leaking through the agent's type signatures.
- A bug fix for any v6 quirk (`inputTokens` vs `promptTokens`,
  `inputSchema` vs `parameters`, `TypedToolCall.input` vs `args`) had to be
  applied in three places. The "abstraction" in `@awecode/llm` existed but
  was bypassed for the most important call path (the tool-aware chat loop).
- Separately, the base system prompt — a behavior/persona contract, not
  control flow — was inlined as a string constant inside the chat loop
  function, while `@awecode/workflow` correctly externalizes its persona
  prompts as `SKILL.md` assets. Same concern, two inconsistent treatments.

## Decision

`@awecode/llm` is the **single chokepoint** for the AI SDK. No other package
imports runtime symbols from `ai` or `@ai-sdk/*`. Concretely:

1. `@awecode/llm` owns `chat`, `streamChat`, `streamChatWithTools`,
   `buildToolSet`, `normalizeToolCall`, and `resolveProviderConfig`. It is
   the only package that imports `streamText` / `generateText` / `jsonSchema`
   / `createAnthropic` / `createOpenAI` / `createGoogleGenerativeAI` /
   `createOllama`.
2. `@awecode/agent` consumes the chokepoint: `chat.ts` calls
   `streamChatWithTools`; `context/compact.ts` calls `chat`. The agent's
   local copies of `buildToolSet` / `normalizeToolCall` are deleted.
3. The base system prompt is externalized to
   `packages/agent/prompts/system.md`, shipped as a filesystem asset via the
   `exports` map (`"./prompts/*": "./prompts/*"`). This mirrors the proven
   `@awecode/workflow` skills pattern (`"./skills/*": "./skills/*"` and
   `getBuiltInSkillsDir()`). A `loadSystemPrompt()` loader resolves the path
   relative to the module (`join(__dirname, '..', 'prompts', 'system.md')`),
   working in both dev (`src/`) and built (`dist/`) layouts because `prompts/`
   is a sibling of both. The inline `DEFAULT_SYSTEM_PROMPT` export is kept as
   a fallback and drift-guard reference.

### Acceptable residual: type-only `ModelMessage` import

`packages/agent/src/chat.ts` retains `import type { ModelMessage } from 'ai'`.
This is a **type-only** import — it carries no runtime behaviour and is erased
at compile time. `ModelMessage` is the SDK's canonical conversation-message
type, used by `@awecode/llm`'s own public signatures
(`streamChatWithTools`'s `messages: ModelMessage[]`). Banning it would force
`@awecode/llm` to re-export the type, which is a viable follow-up but was
deferred to avoid expanding this refactor's scope. The runtime ban (no
`streamText` / `generateText` / `jsonSchema` / provider factories outside
`@awecode/llm`) is the constraint that matters and is fully enforced.

### Why a local structural type for `ToolDefinition`

`buildToolSet` in `@awecode/llm/adapter.ts` accepts a local
`AdapterToolDefinition` (`{ name, description, parameters }`) rather than
importing `ToolDefinition` from `@awecode/tools`. This keeps
`@awecode/llm` (an infra-leaf package) free of a dependency on
`@awecode/tools` (a domain-leaf package). The real `ToolDefinition` satisfies
`AdapterToolDefinition` structurally with no cast, mirroring how
`adaptToolHandler` in `@awecode/tools` already uses local structural typing to
avoid importing consumer types.

## Alternatives considered

1. **Duplicate the adapter helpers in each consumer.** Rejected — the
   original pain point. Three copies of the v6 migration quirks.
2. **Move `ToolDefinition` into `@awecode/llm`.** Rejected — reverses the
   currently-clean ownership (`@awecode/tools` owns tool types) and would
   force `@awecode/tools` to depend on `@awecode/llm` for its own type.
3. **Add `@awecode/llm → @awecode/tools` dependency.** Rejected — couples an
   infra-leaf to a domain-leaf and risks a future cycle if `tools` ever needs
   `llm`. The local structural type achieves the same goal with no edge.
4. **Bundle the prompt `.md` into JS via a tsup loader.** Rejected — defeats
   the externalization goal (no hot-edit, no `./prompts/*` subpath export)
   and diverges from the workflow precedent.
5. **Two-path probe (`existsSync`) for prompt resolution.** Rejected — the
   second path was based on the false premise that `src/chat.ts` sits two
   levels below the package root. It doesn't; `src/` is one level under
   `packages/agent/`, exactly like `dist/`. A single relative path is
   provably correct with fewer moving parts.

## Consequences

- **Positive**
  - AI SDK v6 (and future v7+) migrations touch exactly one package.
  - The agent's `chat.ts` is pure orchestration (loop, diff detection,
    intent, context tracking, tool dispatch); all SDK glue is gone.
  - The base prompt is editable without touching code, and diff-able in
    review. A drift-guard test asserts the `.md` equals the fallback string.
  - `streamChatWithTools` exposes both `toCompletion()` (primary) and a
    `textStream` escape hatch, with a re-entry guard preventing the
    silent-empty failure mode that would arise from draining the shared
    stream twice.
- **Negative**
  - `@awecode/llm`'s public API surface grows by 5 symbols
    (`streamChatWithTools`, `StreamWithToolsOptions`, `StreamWithToolsResult`,
    `buildToolSet`, `normalizeToolCall`, `resolveProviderConfig`). Permanent
    commitment to maintain.
  - The runtime ban is policed by review today, not mechanically. An ESLint
    `no-restricted-imports` rule is the recommended follow-up to enforce it.
- **Neutral**
  - `import type { ModelMessage } from 'ai'` remains in `agent/chat.ts`.
    Acceptable as type-only; severable later by re-exporting from
    `@awecode/llm`.

## Enforcement

The runtime chokepoint is currently enforced by code review. A follow-up
ESLint `no-restricted-imports` rule should ban `import ... from 'ai'` (and
`@ai-sdk/*`) outside `packages/llm/`, allowing only `import type` exceptions
where unavoidable. This converts the architectural rule from convention into
a build failure.
