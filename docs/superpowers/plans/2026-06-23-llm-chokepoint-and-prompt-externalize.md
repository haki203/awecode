# `@awecode/llm` Chokepoint + Base Prompt Externalize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `@awecode/llm` the only package that imports from `ai`, and move the agent's base system prompt into an editable Markdown asset.

**Architecture:** Add two new modules to `@awecode/llm` (`adapter.ts` for tool-set/tool-call normalization, `stream-tools.ts` for streaming-with-tools). Add a `prompts/system.md` asset to `@awecode/agent` shipped via the `exports` map (mirrors the `workflow/skills` precedent). Then cut over `agent/chat.ts` and `agent/context/compact.ts` to consume `@awecode/llm` instead of importing `ai` directly. No behavior change; pure relocation.

**Tech Stack:** TypeScript (ESM, `"type": "module"`), Vercel AI SDK v6 (`ai` package), Vitest, tsup, Yarn workspaces.

**Spec:** `docs/superpowers/specs/2026-06-23-llm-chokepoint-and-prompt-externalize-design.md`

---

## File Structure

**Create:**
- `packages/agent/prompts/system.md` — base system prompt content (asset, sibling of `src/` and `dist/`)
- `packages/llm/src/adapter.ts` — `AdapterToolDefinition`, `NormalizedToolCall`, `buildToolSet`, `normalizeToolCall`
- `packages/llm/src/stream-tools.ts` — `streamChatWithTools`, `StreamWithToolsOptions`, `StreamWithToolsResult`
- `packages/llm/tests/adapter.test.ts` — unit tests for the two adapter functions
- `packages/llm/tests/stream-tools.test.ts` — tests for `streamChatWithTools`
- `packages/agent/tests/system-prompt.test.ts` — drift guard + loader test

**Modify:**
- `packages/agent/package.json` — add `"./prompts/*": "./prompts/*"` to `exports`
- `packages/agent/src/chat.ts` — remove `ai` import; load prompt from file; call `streamChatWithTools`; delete local `buildToolSet`/`normalizeToolCall`
- `packages/agent/src/context/compact.ts` — remove `ai` import; call `chat()` from `@awecode/llm`
- `packages/agent/tests/chat.test.ts` — switch mock from `'ai'` to `@awecode/llm`
- `packages/llm/src/index.ts` — export the two new modules
- `packages/llm/src/chat.ts` — extract `resolveProviderConfig` as an exported internal helper (used by `stream-tools.ts`)

**Task dependency:** Task 1 (prompt) is independent. Tasks 2 → 3 → 4 are sequential (adapter → stream-tools → cutover). Task 1 may be done in parallel with or after the others.

---

## Task 1: Externalize `DEFAULT_SYSTEM_PROMPT` into `prompts/system.md`

**Files:**
- Create: `packages/agent/prompts/system.md`
- Create: `packages/agent/tests/system-prompt.test.ts`
- Modify: `packages/agent/src/chat.ts:68-88` (add loader) and `packages/agent/package.json` (exports map)

This task does NOT touch any `ai` import — it only relocates the prompt string. `chat.ts` still imports `streamText` etc. after this task (those are removed in Task 4).

- [ ] **Step 1: Create the prompt asset file**

Create `packages/agent/prompts/system.md` with the exact content of the current `DEFAULT_SYSTEM_PROMPT` string (from `chat.ts:68-88`), as plain Markdown with no front-matter:

```markdown
You are awecode, a CLI coding agent.

When you need to modify files, output a diff block in this format:

file_path: <path>
<<<< SEARCH
<source code to find>
====
<replacement code>
>>>> REPLACE

For inserts (empty search), add an anchor:

file_path: <path>
at: @after: function foo
<<<< SEARCH
====
<new code>
>>>> REPLACE

Use the read_file, search_files, list_files, and shell_exec tools to explore the codebase before making changes.
```

- [ ] **Step 2: Write the failing test**

Create `packages/agent/tests/system-prompt.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import {
  DEFAULT_SYSTEM_PROMPT,
  getSystemPromptPath,
} from '../src/chat.js';

describe('system prompt externalization', () => {
  it('getSystemPromptPath resolves to an existing file', () => {
    expect(existsSync(getSystemPromptPath())).toBe(true);
  });

  it('the file content equals DEFAULT_SYSTEM_PROMPT (drift guard)', async () => {
    const { readFileSync } = await import('node:fs');
    const fileContent = readFileSync(getSystemPromptPath(), 'utf-8').trim();
    // If this fails, either edit the .md to match or edit the fallback string
    // to match — they must not drift.
    expect(fileContent).toBe(DEFAULT_SYSTEM_PROMPT);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `yarn workspace @awecode/agent test`
Expected: FAIL — `getSystemPromptPath is not a function` (not yet implemented).

- [ ] **Step 4: Add the loader to `chat.ts`**

At the top of `packages/agent/src/chat.ts`, add imports (after the existing imports, before the interface declarations):

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
```

Keep the existing `DEFAULT_SYSTEM_PROMPT` constant exactly as-is (it is the fallback and the drift-guard reference). Immediately AFTER the `DEFAULT_SYSTEM_PROMPT` declaration (currently ends at line 88), add:

```ts
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * Absolute path to the externalized base prompt. `prompts/` is a sibling of
 * both `src/` (dev) and `dist/` (built), so going up one level from this
 * module reaches `packages/agent/` in both layouts. Mirrors the
 * `getBuiltInSkillsDir()` pattern in @awecode/workflow.
 */
export function getSystemPromptPath(): string {
  return join(MODULE_DIR, '..', 'prompts', 'system.md');
}

function loadSystemPrompt(): string {
  try {
    return readFileSync(getSystemPromptPath(), 'utf-8').trim();
  } catch {
    return DEFAULT_SYSTEM_PROMPT;
  }
}

const SYSTEM_PROMPT = loadSystemPrompt();
```

Then change the one usage. Find the line `system: opts.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,` inside `runChatLoop` and change it to:

```ts
system: opts.systemPrompt ?? SYSTEM_PROMPT,
```

- [ ] **Step 5: Add the exports map entry**

In `packages/agent/package.json`, add the `./prompts/*` subpath to `exports`. The result:

```json
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js"
  },
  "./persistence/sessions": {
    "types": "./src/persistence/sessions.ts",
    "import": "./src/persistence/sessions.ts"
  },
  "./persistence/checkpoint": {
    "types": "./src/persistence/checkpoint.ts",
    "import": "./src/persistence/checkpoint.ts"
  },
  "./prompts/*": "./prompts/*"
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `yarn workspace @awecode/agent test`
Expected: PASS — both new tests green, plus all existing chat tests unchanged.

- [ ] **Step 7: Typecheck**

Run: `yarn workspace @awecode/agent typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/agent/prompts/system.md packages/agent/tests/system-prompt.test.ts packages/agent/src/chat.ts packages/agent/package.json
git commit -m "feat(agent): externalize DEFAULT_SYSTEM_PROMPT into prompts/system.md"
```

---

## Task 2: Add `adapter.ts` to `@awecode/llm` (`buildToolSet` + `normalizeToolCall`)

**Files:**
- Create: `packages/llm/src/adapter.ts`
- Create: `packages/llm/tests/adapter.test.ts`
- Modify: `packages/llm/src/index.ts`

These are pure functions moved verbatim from `agent/chat.ts:109-156`. No consumer changes yet (agent keeps using its local copies until Task 4).

- [ ] **Step 1: Write the failing test**

Create `packages/llm/tests/adapter.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

// jsonSchema is a thin wrapper in the real SDK; mock it to identity so the
// test asserts on the raw schema object shape without depending on SDK internals.
vi.mock('ai', () => ({
  jsonSchema: (schema: unknown) => schema,
}));

import { buildToolSet, normalizeToolCall } from '../src/adapter.js';

describe('buildToolSet', () => {
  it('converts ToolDefinition[] into a ToolSet keyed by name', () => {
    const defs = [
      {
        name: 'read_file',
        description: 'Read a file',
        parameters: { type: 'object', properties: { path: { type: 'string' } } },
      },
      {
        name: 'list_files',
        description: 'List files',
        parameters: { type: 'object', properties: {} },
      },
    ];
    const set = buildToolSet(defs);
    expect(Object.keys(set).sort()).toEqual(['list_files', 'read_file']);
    expect((set as Record<string, { description: string }>).read_file.description).toBe('Read a file');
  });

  it('produces an empty object for an empty array', () => {
    expect(Object.keys(buildToolSet([]))).toHaveLength(0);
  });
});

describe('normalizeToolCall', () => {
  it('reads v6 `input` field when present', () => {
    const result = normalizeToolCall({
      toolName: 'read_file',
      input: { path: '/x' },
      toolCallId: 'call-1',
    });
    expect(result).toEqual({
      name: 'read_file',
      arguments: { path: '/x' },
      id: 'call-1',
    });
  });

  it('falls back to legacy `args` field when `input` is absent', () => {
    const result = normalizeToolCall({
      toolName: 'read_file',
      args: { path: '/y' },
    });
    expect(result.name).toBe('read_file');
    expect(result.arguments).toEqual({ path: '/y' });
    expect(result.id).toBeUndefined();
  });

  it('defaults arguments to empty object when payload is null or non-object', () => {
    const r1 = normalizeToolCall({ toolName: 'x', input: null });
    const r2 = normalizeToolCall({ toolName: 'x', args: 'not-an-object' });
    expect(r1.arguments).toEqual({});
    expect(r2.arguments).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @awecode/llm test`
Expected: FAIL — `Cannot find module '../src/adapter.js'`.

- [ ] **Step 3: Implement `adapter.ts`**

Create `packages/llm/src/adapter.ts`:

```ts
// Copyright 2026 Awecode Contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { jsonSchema, type ToolSet } from 'ai';

/**
 * Structural subset of @awecode/tools' ToolDefinition that buildToolSet reads.
 * Declared locally so @awecode/llm does not depend on @awecode/tools. The real
 * ToolDefinition satisfies this structurally (it has exactly these 3 fields),
 * so callers pass concrete definitions with no cast.
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

/**
 * Lifts each ToolDefinition into the AI SDK v6 `{ description, inputSchema }`
 * shape and accumulates them into a `ToolSet`. AI SDK v6 requires raw JSON
 * Schema objects to be wrapped with `jsonSchema()` — without it the SDK's
 * `asSchema()` calls `.schema()` on the plain object and throws
 * `TypeError: schema is not a function`.
 */
export function buildToolSet(defs: AdapterToolDefinition[]): ToolSet {
  const acc: Record<string, { description: string; inputSchema: unknown }> = {};
  for (const def of defs) {
    acc[def.name] = {
      description: def.description,
      inputSchema: jsonSchema(def.parameters),
    };
  }
  return acc as ToolSet;
}

/**
 * Normalises a tool call coming back from `streamText` into the
 * `{ name, arguments, id }` shape the dispatcher expects.
 *
 * AI SDK v6 types tool calls as `TypedToolCall` carrying the payload on an
 * `input` field; the legacy spelling is `args`. We read whichever is present.
 * `id` preserves the provider-assigned `toolCallId` (required by OpenAI /
 * Anthropic for tool-result correlation).
 */
export function normalizeToolCall(call: {
  toolName: string;
  input?: unknown;
  args?: unknown;
  toolCallId?: string;
}): NormalizedToolCall {
  const raw =
    'input' in call && call.input !== undefined ? call.input : call.args;
  const args =
    raw !== null && typeof raw === 'object'
      ? (raw as Record<string, unknown>)
      : {};
  return { name: call.toolName, arguments: args, id: call.toolCallId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @awecode/llm test`
Expected: PASS — all adapter tests green.

- [ ] **Step 5: Export from `index.ts`**

In `packages/llm/src/index.ts`, add after the existing `chat` export (line 36):

```ts
export {
  buildToolSet,
  normalizeToolCall,
} from './adapter.js';
export type {
  AdapterToolDefinition,
  NormalizedToolCall,
} from './adapter.js';
```

- [ ] **Step 6: Typecheck**

Run: `yarn workspace @awecode/llm typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/llm/src/adapter.ts packages/llm/tests/adapter.test.ts packages/llm/src/index.ts
git commit -m "feat(llm): add adapter module (buildToolSet, normalizeToolCall)"
```

---

## Task 3: Add `stream-tools.ts` to `@awecode/llm` (`streamChatWithTools`)

**Files:**
- Create: `packages/llm/src/stream-tools.ts`
- Create: `packages/llm/tests/stream-tools.test.ts`
- Modify: `packages/llm/src/chat.ts` (extract `resolveProviderConfig` as exported helper)
- Modify: `packages/llm/src/index.ts`

Encapsulates the streaming-with-tools pattern. No consumer changes yet.

- [ ] **Step 1: Extract `resolveProviderConfig` from `llm/chat.ts`**

In `packages/llm/src/chat.ts`, the function `resolveProviderConfig` (currently private, lines 58-66) is duplicated logic that `stream-tools.ts` also needs. Rename it to be exported so `stream-tools.ts` can reuse it. Change:

```ts
function resolveProviderConfig(config: AwecodeConfig) {
```

to:

```ts
export function resolveProviderConfig(config: AwecodeConfig) {
```

(The body and doc-comment stay identical. It is already re-used by both `chat` and `streamChat` in this file; making it exported lets `stream-tools.ts` import it without duplicating the provider-missing error message.)

- [ ] **Step 2: Write the failing test**

Create `packages/llm/tests/stream-tools.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

// Mock 'ai' with a controllable streamText so we can assert on the behaviour
// of streamChatWithTools without a real provider.
const mockStreamText = vi.fn();
vi.mock('ai', () => ({
  streamText: (...args: unknown[]) => mockStreamText(...args),
  jsonSchema: (s: unknown) => s,
}));

import { streamChatWithTools } from '../src/stream-tools.js';
import type { AwecodeConfig } from '../src/types.js';

const mockConfig: AwecodeConfig = {
  activeProvider: 'mock',
  providers: {
    mock: {
      type: 'ollama' as const,
      baseURL: 'http://localhost:11434',
      defaultModel: 'mock-model',
    },
  },
};

function makeStreamResponse(text: string, toolCalls: unknown[] = []) {
  return {
    textStream: (async function* () {
      for (const ch of text) yield ch;
    })(),
    toolCalls: Promise.resolve(toolCalls),
  };
}

describe('streamChatWithTools', () => {
  it('fires onToken for each chunk and returns accumulated text via toCompletion', async () => {
    mockStreamText.mockResolvedValueOnce(makeStreamResponse('Hi!'));
    const tokens: string[] = [];
    const result = await streamChatWithTools({
      config: mockConfig,
      messages: [{ role: 'user', content: 'hi' }],
      tools: {},
      system: 'sys',
      onToken: (c) => tokens.push(c),
    });
    const { assistantText, toolCalls } = await result.toCompletion();
    expect(tokens.join('')).toBe('Hi!');
    expect(assistantText).toBe('Hi!');
    expect(toolCalls).toEqual([]);
  });

  it('normalizes tool calls via normalizeToolCall', async () => {
    mockStreamText.mockResolvedValueOnce(
      makeStreamResponse('', [
        { toolName: 'read_file', input: { path: '/x' }, toolCallId: 'c1' },
      ]),
    );
    const result = await streamChatWithTools({
      config: mockConfig,
      messages: [{ role: 'user', content: 'hi' }],
      tools: {},
      system: 'sys',
    });
    const { toolCalls } = await result.toCompletion();
    expect(toolCalls).toEqual([
      { name: 'read_file', arguments: { path: '/x' }, id: 'c1' },
    ]);
  });

  it('throws when active provider is missing', async () => {
    const badConfig: AwecodeConfig = {
      activeProvider: 'missing',
      providers: {},
    };
    await expect(
      streamChatWithTools({
        config: badConfig,
        messages: [],
        tools: {},
        system: 'sys',
      }),
    ).rejects.toThrow(/Active provider "missing"/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `yarn workspace @awecode/llm test`
Expected: FAIL — `Cannot find module '../src/stream-tools.js'`.

- [ ] **Step 4: Implement `stream-tools.ts`**

Create `packages/llm/src/stream-tools.ts`:

```ts
// Copyright 2026 Awecode Contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { streamText } from 'ai';
import type { ModelMessage, ToolSet } from 'ai';
import type { AwecodeConfig } from './types.js';
import { createProvider } from './providers.js';
import { resolveProviderConfig } from './chat.js';
import { normalizeToolCall, type NormalizedToolCall } from './adapter.js';

export interface StreamWithToolsOptions {
  config: AwecodeConfig;
  messages: ModelMessage[];
  tools: ToolSet;
  system: string;
  maxOutputTokens?: number;
  abortSignal?: AbortSignal;
  modelOverride?: string;
  /** Fired for each streamed text delta. Primary streaming access path. */
  onToken?: (chunk: string) => void;
}

export interface StreamWithToolsResult {
  /**
   * Low-level escape hatch for callers that want to iterate the raw token
   * stream directly. Most callers should use {@link toCompletion} instead.
   */
  textStream: AsyncIterable<string>;
  /**
   * Drain the stream and resolve the assistant text + normalized tool calls.
   * If {@link StreamWithToolsOptions.onToken} was provided, it is invoked
   * once per chunk as the stream drains.
   */
  toCompletion(): Promise<{
    assistantText: string;
    toolCalls: NormalizedToolCall[];
  }>;
}

export async function streamChatWithTools(
  opts: StreamWithToolsOptions,
): Promise<StreamWithToolsResult> {
  const providerConfig = resolveProviderConfig(opts.config);
  const model = createProvider(providerConfig, opts.modelOverride);

  const result = await streamText({
    model,
    messages: opts.messages,
    system: opts.system,
    tools: opts.tools,
    maxOutputTokens: opts.maxOutputTokens,
    abortSignal: opts.abortSignal,
  });

  return {
    textStream: result.textStream,
    async toCompletion() {
      let assistantText = '';
      for await (const chunk of result.textStream) {
        assistantText += chunk;
        opts.onToken?.(chunk);
      }
      const rawToolCalls = await result.toolCalls;
      const toolCalls = (rawToolCalls ?? []).map((c) =>
        normalizeToolCall({
          toolName: (c as { toolName: string }).toolName,
          input: (c as { input?: unknown }).input,
          args: (c as { args?: unknown }).args,
          toolCallId: (c as { toolCallId?: string }).toolCallId,
        }),
      );
      return { assistantText, toolCalls };
    },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn workspace @awecode/llm test`
Expected: PASS — all stream-tools tests green, plus existing chat.test.ts still green.

- [ ] **Step 6: Export from `index.ts`**

In `packages/llm/src/index.ts`, add after the adapter export added in Task 2:

```ts
export { streamChatWithTools } from './stream-tools.js';
export type {
  StreamWithToolsOptions,
  StreamWithToolsResult,
} from './stream-tools.js';
export { resolveProviderConfig } from './chat.js';
```

- [ ] **Step 7: Typecheck**

Run: `yarn workspace @awecode/llm typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/llm/src/stream-tools.ts packages/llm/tests/stream-tools.test.ts packages/llm/src/chat.ts packages/llm/src/index.ts
git commit -m "feat(llm): add streamChatWithTools for tool-aware streaming"
```

---

## Task 4: Cut over `agent/chat.ts` and `agent/context/compact.ts` to consume `@awecode/llm`

**Files:**
- Modify: `packages/agent/src/chat.ts` (remove `ai` import + local adapters; call `streamChatWithTools`)
- Modify: `packages/agent/src/context/compact.ts` (remove `ai` import; call `chat` from llm)
- Modify: `packages/agent/tests/chat.test.ts` (switch mock from `'ai'` to `@awecode/llm`)

This is the cutover. After this task, `grep -r "from 'ai'" packages/agent` returns nothing.

- [ ] **Step 1: Update the agent chat test mock**

The existing test (`packages/agent/tests/chat.test.ts`) mocks `'ai'` directly. After the cutover, `agent/chat.ts` no longer imports `'ai'`; it imports `streamChatWithTools` from `@awecode/llm`. Update the mocks.

Replace the mock block at the top of `packages/agent/tests/chat.test.ts` (lines 20-52, the two `vi.mock` calls and `makeStreamResponse` helper). The new top of file (imports + mocks):

```ts
import { describe, it, expect, vi } from 'vitest';
import { runChatLoop } from '../src/chat.js';
import { ContextManager } from '../src/context/manager.js';
import type { AwecodeConfig } from '@awecode/llm';

// After the cutover, agent imports streamChatWithTools from @awecode/llm
// (not streamText from 'ai'). Mock it with a controllable implementation.
const mockStreamChatWithTools = vi.fn();
vi.mock('@awecode/llm', async () => {
  const actual = await vi.importActual<typeof import('@awecode/llm')>('@awecode/llm');
  return {
    ...actual,
    streamChatWithTools: (...args: unknown[]) => mockStreamChatWithTools(...args),
  };
});

const mockConfig: AwecodeConfig = {
  activeProvider: 'mock',
  providers: {
    mock: {
      type: 'ollama' as const,
      baseURL: 'http://localhost:11434',
      defaultModel: 'mock-model',
    },
  },
};

function makeStreamResult(text: string, toolCalls: unknown[] = []) {
  return {
    textStream: (async function* () {
      for (const ch of text) yield ch;
    })(),
    toCompletion: async () => ({
      assistantText: text,
      toolCalls: toolCalls.map((c) => ({
        name: (c as { toolName: string }).toolName,
        arguments: (c as { input?: unknown }).input ?? (c as { args?: unknown }).args ?? {},
        id: (c as { toolCallId?: string }).toolCallId,
      })),
    }),
  };
}
```

Then in every test body, replace `mockStreamText.mockResolvedValueOnce(makeStreamResponse(...))` with `mockStreamChatWithTools.mockResolvedValueOnce(makeStreamResult(...))`. The arguments to `makeStreamResult` are identical to what `makeStreamResponse` received in each test (same text, same toolCalls arrays). Search-and-replace the function name; leave all other test logic untouched.

- [ ] **Step 2: Run agent tests to verify they fail (red — chat.ts still uses old path)**

Run: `yarn workspace @awecode/agent test`
Expected: FAIL — tests call the new mock but `chat.ts` still calls `streamText` from `ai` (which is no longer mocked). This confirms the test now targets the new code path.

- [ ] **Step 3: Refactor `agent/chat.ts` imports and remove local adapters**

In `packages/agent/src/chat.ts`:

1. Change the import block at the top. Replace:
   ```ts
   import { streamText, jsonSchema, type ModelMessage, type ToolSet } from 'ai';
   import { createProvider } from '@awecode/llm';
   import type { AwecodeConfig } from '@awecode/llm';
   ```
   with:
   ```ts
   import type { ModelMessage } from 'ai';
   import { streamChatWithTools, buildToolSet } from '@awecode/llm';
   import type { AwecodeConfig } from '@awecode/llm';
   ```

   Note: `ModelMessage` is still imported from `ai` as a **type only** — it is a shared domain type, not SDK runtime behaviour, and `@awecode/llm` re-exports it transitively via its own function signatures. Keeping the type import is acceptable; if a stricter ban is later desired, re-export `ModelMessage` from `@awecode/llm` and import it there. For now the runtime ban (no `streamText`, no `generateText`, no `jsonSchema`) is what matters.

2. Delete the entire `buildToolSet` function (lines 109-120) and the `NormalizedToolCall` interface + `normalizeToolCall` function (lines 136-156). These now live in `@awecode/llm/adapter.ts`.

- [ ] **Step 4: Rewrite the stream call site inside `runChatLoop`**

Replace the block (the `streamText` call + the manual `textStream` loop + the `result.toolCalls` await) with a single call to `streamChatWithTools` + `toCompletion`. The new loop body (replacing the current lines ~206-242):

```ts
      const result = await streamChatWithTools({
        config: opts.config,
        messages,
        tools,
        system: opts.systemPrompt ?? SYSTEM_PROMPT,
        maxOutputTokens: 4096,
        abortSignal: opts.abortSignal,
        modelOverride: opts.modelOverride,
        onToken: (chunk) => opts.onToken?.(chunk),
      });
      const { assistantText, toolCalls } = await result.toCompletion();

      // Detect an empty stream: the provider returned no assistant text AND
      // no tool calls. Throw a stable, repo-owned message so callers can
      // match on it deterministically.
      if (assistantText === '' && (!toolCalls || toolCalls.length === 0)) {
        const err = new Error(
          'No output generated. Check the stream for errors.',
        );
        opts.onError?.(err);
        throw err;
      }
```

Leave everything below this (diff detection, intent, message push, context tracking, tool dispatch loop) **exactly as-is**. The downstream code already consumes `assistantText` and `toolCalls` as local names, which `toCompletion()` now provides.

In the tool-dispatch loop further down, the code currently does `const normalized = normalizeToolCall(call);` on each SDK tool call. Since `toCompletion()` already returns normalized calls, change:

```ts
      for (const call of toolCalls) {
        const normalized = normalizeToolCall(call);
        opts.onToolCall?.(normalized.name, normalized.arguments);
        const toolResult = await dispatchTool({
          name: normalized.name,
          arguments: normalized.arguments,
        });
```

to:

```ts
      for (const call of toolCalls) {
        opts.onToolCall?.(call.name, call.arguments);
        const toolResult = await dispatchTool({
          name: call.name,
          arguments: call.arguments,
        });
```

The rest of the loop body (`opts.onToolResult`, `opts.context.addToolResult`, the `toolCallId` construction, the `messages.push({ role: 'tool', ... })`) stays identical — it only referenced `normalized.name`/`normalized.id`, which are now `call.name`/`call.id`.

- [ ] **Step 5: Run agent tests to verify they pass**

Run: `yarn workspace @awecode/agent test`
Expected: PASS — all chat tests green (including the empty-output guard, diff detection, tool dispatch, context tracking), plus the system-prompt tests from Task 1.

- [ ] **Step 6: Refactor `agent/context/compact.ts`**

In `packages/agent/src/context/compact.ts`:

1. Replace the imports:
   ```ts
   import { generateText } from 'ai';
   import { createProvider } from '@awecode/llm';
   import type { AwecodeConfig } from '@awecode/llm';
   ```
   with:
   ```ts
   import { chat } from '@awecode/llm';
   import type { AwecodeConfig } from '@awecode/llm';
   ```

2. Replace the body of `compactContext` (the manual `createProvider` + `generateText` call). The function currently resolves the provider itself; after the cutover it delegates to `chat()` from `@awecode/llm`, which resolves the provider internally and normalizes v6 usage fields. Replace:

   ```ts
   const providerConfig = config.providers[config.activeProvider];
   if (!providerConfig) throw new Error('No active provider');

   const model = createProvider(providerConfig);
   const beforeTokens = entries.reduce((s, e) => s + e.tokens, 0);

   const conversationText = entries.map((e) => e.content).join('\n\n');
   const recentText = recentTurns
     .map((t) => `${t.role}: ${t.content}`)
     .join('\n');

   const result = await generateText({
     model,
     system: SUMMARIZATION_PROMPT,
     prompt: `Conversation to summarize:\n\n${conversationText}\n\n--- Recent turns ---\n${recentText}`,
     maxOutputTokens: 2048,
   });
   ```
   with:
   ```ts
   const beforeTokens = entries.reduce((s, e) => s + e.tokens, 0);

   const conversationText = entries.map((e) => e.content).join('\n\n');
   const recentText = recentTurns
     .map((t) => `${t.role}: ${t.content}`)
     .join('\n');

   // chat() from @awecode/llm wraps generateText and resolves the provider
   // internally. The summarization prompt is the system; the conversation
   // to summarize is folded into a single user message (chat() takes no
   // standalone `prompt` field).
   const result = await chat(
     config,
     [
       {
         role: 'user',
         content: `Conversation to summarize:\n\n${conversationText}\n\n--- Recent turns ---\n${recentText}`,
       },
     ],
     {
       systemPrompt: SUMMARIZATION_PROMPT,
       maxTokens: 2048,
     },
   );
   ```

   The line `const afterTokens = countTokens(result.text);` and the `return { summary, tokensSaved }` stay unchanged.

- [ ] **Step 7: Update `compact.test.ts` mock and verify it passes**

`packages/agent/tests/compact.test.ts` currently mocks `'ai'` directly with a legacy v5 usage shape (`promptTokens`/`completionTokens`). After the cutover, `compact.ts` calls `chat()` from `@awecode/llm`, which internally reads v6 `usage.inputTokens`. Update the mocks:

Replace the top mock block (lines 6-16):
```ts
vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({
    text: '## Summary\n\nTask: fix bug\nDecisions: use approach X',
    usage: { promptTokens: 100, completionTokens: 30 },
  }),
  jsonSchema: (schema: unknown) => schema,
}));

vi.mock('@awecode/llm', () => ({
  createProvider: vi.fn(() => ({})),
}));
```
with:
```ts
// After the cutover, compact.ts calls chat() from @awecode/llm, which wraps
// generateText and translates v6 usage (inputTokens/outputTokens) back to
// the public promptTokens/completionTokens names. Mock chat directly.
vi.mock('@awecode/llm', () => ({
  chat: vi.fn().mockResolvedValue({
    text: '## Summary\n\nTask: fix bug\nDecisions: use approach X',
    usage: { promptTokens: 100, completionTokens: 30, totalTokens: 130 },
  }),
}));
```

Run: `yarn workspace @awecode/agent test`
Expected: PASS — `compact.test.ts` green (the two assertions are `summary` contains 'Summary' and `tokensSaved > 0`; both still hold with the mocked return).

- [ ] **Step 8: Verify no agent file imports `ai` runtime symbols**

Run: search `packages/agent/src` for `from 'ai'`. The only acceptable matches are **type-only** imports of `ModelMessage`. Confirm there are zero imports of `streamText`, `generateText`, or `jsonSchema`.

- [ ] **Step 9: Full workspace typecheck + test**

Run: `yarn typecheck`
Run: `yarn test`
Expected: all green across all packages.

- [ ] **Step 10: Commit**

```bash
git add packages/agent/src/chat.ts packages/agent/src/context/compact.ts packages/agent/tests/chat.test.ts
git commit -m "refactor(agent): route all AI SDK calls through @awecode/llm

agent/chat.ts and agent/context/compact.ts no longer import streamText/
generateText/jsonSchema from 'ai' directly. streamChatWithTools + chat from
@awecode/llm are now the single chokepoint for provider calls. The local
buildToolSet/normalizeToolCall copies are deleted in favour of the llm adapter."
```

---

## Final verification

- [ ] **Grep gate:** `Select-String -Path "packages/*/src/**/*.ts" -Pattern "from 'ai'"` — the ONLY hit should be inside `packages/llm/src/`. If any agent/harness/cli/etc. file imports from `'ai'`, that is a regression.
- [ ] **Build:** `yarn build` — all packages build (confirms the `prompts/*` export map and asset shipping work post-build).
- [ ] **End-to-end smoke:** `yarn workspace @awecode/cli start chat-test` (or the repo's equivalent smoke command) — confirms a real provider call still streams tokens.
