# Awecode Plan 6: Chat ↔ Harness Orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `@awecode/agent` chat loop to `@awecode/harness` primitives via a new `@awecode/orchestrator` package. Build the full Diff Cycle: LLM emits diff → approve per-block → create worktree → apply → self-heal (with HARNESS-1 `diffFailStreak` guard now enforced) → merge → commit on working dir → cleanup. Each LLM diff response is one Diff Cycle owning one Worktree.

**Architecture:** New `@awecode/orchestrator` package is a glue layer — does not modify `runChatLoop` logic, only hooks via `onDiffDetected`. Adds callback `onDiffApplyFailed` to self-heal loop (Q4/A) for retry semantics separate from command-fail. Orchestrator injects fake user messages into the shared `messages` array (Q7/A) to make the LLM regenerate, keeping `runChatLoop` as the single LLM owner.

**Tech Stack:** `simple-git` (already in harness), `@awecode/{agent,diff,harness}`, Vercel AI SDK `ModelMessage` type, Node `readline` + `child_process` (for editor open in ApprovalPrompter).

## Global Constraints

- **License header:** every `src/*.ts` file starts with the Apache 2.0 header (see `packages/diff/src/index.ts:1-13` for canonical text). Tests do NOT carry the header.
- **Commit messages:** prefix `awecode:`, e.g. `feat(orchestrator): ...`, `fix(harness): ...`, `chore: ...`.
- **TypeScript config:** `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, ES2022/ESNext, Bundler moduleResolution. Each package `tsconfig.json` extends `../../tsconfig.base.json` and sets `typeRoots`/`types: ["node"]`/`ignoreDeprecations: "6.0"` (matches all 5 sibling packages).
- **Build/test invocation:** `yarn workspace @awecode/<pkg> build|typecheck` works. `yarn workspace @awecode/<pkg> test` is BROKEN (root `vitest.config.ts` repo-root-relative globs — pre-existing). Run tests via `npx vitest run packages/<pkg>/tests/<file>` from repo root.
- **`&&` invalid in PowerShell** — use `;` or separate calls.
- **Git add discipline:** use selective `git add packages/<pkg>/...` (NOT `git add -A`) to avoid sweeping `.sdd/` artifacts.
- **CRLF insulation:** tests that do git write/read with strict content assertions MUST write `.gitattributes` (`* text=auto eol=lf`) into the tmp repo in `beforeEach` before `git add` (matches Plan 4 Task 7/8/11 fix pattern).
- **Co-authored-by trailer:** Cursor auto-adds `Co-authored-by: Cursor <cursoragent@cursor.com>` to commits made by subagents. Do NOT use `--no-verify`; this is a Cursor feature, not a hook.
- **No placeholders:** every step contains complete code — no "TODO", "implement similar to Task N", or "add error handling".

**References:**

- Spec: `docs/superpowers/specs/2026-06-20-plan6-chat-harness-orchestrator-design.md`
- Spec design-v2 dòng 220-241, 308-311 (Self-heal Loop hybrid control, config table)
- Q2 grill (hybrid control), Q22 (Ctrl+C partial), Q29 (diff fail retry), Q35 (undo = `git revert`)
- ADR-0005 (`.awecode/` layout), ADR-0002 (workflow engine — Plan 5a separate)
- Plan 4 progress ledger `.sdd/progress.md` (HARNESS-1 finding)
- Grill batch 1 (Q1-Q5) + batch 2 (Q6-Q10) — captured in spec's "Decisions from grill" sections

**Locked interfaces consumed:**

- `runChatLoop`, `ChatLoopOptions`, `DEFAULT_SYSTEM_PROMPT` from `@awecode/agent`
- `ApprovalQueue`, `ApprovalRequest`, `ApprovalDecision` from `@awecode/agent` (this plan extends `ApprovalDecision`)
- `ContextManager` from `@awecode/agent`
- `parseDiff`, `applyDiff`, `ParsedDiff`, `DiffBlock` from `@awecode/diff`
- `createWorktree`, `runSelfHealLoop`, `DEFAULT_SELF_HEAL_CONFIG`, `SelfHealCallbacks`, `RunCommandFn`, `runCommand`, `mergeToWorkingDir`, `commitDiff`, `removeWorktree`, `Worktree`, `SelfHealConfig`, `SelfHealEvent`, `CommitStrategy` from `@awecode/harness` (this plan extends `SelfHealCallbacks` and `SelfHealEvent`)

---

## File Structure

```
packages/orchestrator/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── src/
│   ├── index.ts                # Public exports
│   ├── types.ts                # OrchestratorPhase, OrchestratorOptions, DiffCycleResult, ParsedDiffBlock
│   ├── test-detect.ts          # detectTestCommand
│   ├── diff-interceptor.ts     # parseAssistantDiff
│   ├── approval.ts             # ApprovalPrompter class
│   └── orchestrator.ts         # Orchestrator class
└── tests/
    ├── sanity.test.ts
    ├── test-detect.test.ts
    ├── diff-interceptor.test.ts
    ├── approval.test.ts
    └── orchestrator.test.ts    # Integration E2E
```

**Files modified in existing packages:**

- `packages/harness/src/types.ts` — add `diff_fail_streak_reached` event variant
- `packages/harness/src/selfheal.ts` — add `onDiffApplyFailed` callback, counter logic, `abortSignal` param
- `packages/harness/tests/selfheal.test.ts` — update existing "returns applyDiff error on first failure" test, add 2 new tests
- `packages/harness/src/index.ts` — re-export `diff_fail_streak_reached` (auto via union, no change needed)
- `packages/agent/src/approval.ts` — extend `ApprovalDecision` with `'skip_all' | 'accept_all' | 'quit'`
- `packages/agent/src/chat.ts` — minor refactor: accept external `messages` ref instead of copying `initialMessages` (Q7/A)
- `packages/cli/src/commands/chat.ts` — wire Orchestrator + AbortController + shared messages array
- `packages/cli/package.json` — add `@awecode/orchestrator` workspace dep
- `tsconfig.json` (root) — add `packages/orchestrator` reference

---

## Task 1: HARNESS-1 — Add `diff_fail_streak_reached` event + `onDiffApplyFailed` callback (TDD)

**Files:**

- Modify: `packages/harness/src/types.ts`
- Modify: `packages/harness/src/selfheal.ts`
- Modify: `packages/harness/tests/selfheal.test.ts`

- [ ] **Step 1: Update `SelfHealEvent` union** in `packages/harness/src/types.ts`

Add new variant (preserve all existing 8 variants):

```ts
export type SelfHealEvent =
  | { type: 'step_start'; step: number }
  | { type: 'command_start'; command: string }
  | { type: 'command_done'; exitCode: number; stdout: string; stderr: string }
  | { type: 'diff_applied'; filePath: string }
  | { type: 'consecutive_same_error'; count: number }
  | { type: 'diff_fail_streak_reached'; count: number; lastError: string }
  | { type: 'step_cap_reached' }
  | { type: 'user_takeover'; reason: string }
  | { type: 'success' };
```

- [ ] **Step 2: Add `onDiffApplyFailed` to `SelfHealCallbacks`** in `packages/harness/src/selfheal.ts`

```ts
export interface SelfHealCallbacks {
  onEvent: (e: SelfHealEvent) => void;
  onCommandFailed: (stderr: string, lastDiff: string) => Promise<string>;
  onDiffApplyFailed: (error: string, lastDiff: string) => Promise<string>;
  applyDiff: (
    diff: string,
    worktreePath: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}
```

- [ ] **Step 3: Rewrite the apply-diff block in `runSelfHealLoop`**

Replace the existing short-circuit block (currently `if (!applyRes.ok) { return ... }`) with the counter + retry logic. Also add `diffFailStreak` counter init at the top of the function.

```ts
export async function runSelfHealLoop(
  worktree: Worktree,
  initialDiff: string,
  testCommand: string,
  config: SelfHealConfig,
  callbacks: SelfHealCallbacks,
  runCmd: RunCommandFn,
  abortSignal?: AbortSignal,
): Promise<{ success: boolean; finalStderr?: string; stepsUsed: number }> {
  let currentDiff = initialDiff;
  let lastStderr = '';
  let consecutiveSame = 0;
  let diffFailStreak = 0;
  const startTime = Date.now();

  for (let step = 1; step <= config.maxSteps; step++) {
    callbacks.onEvent({ type: 'step_start', step });

    if (Date.now() - startTime > config.totalTimeout) {
      callbacks.onEvent({ type: 'step_cap_reached' });
      return { success: false, finalStderr: lastStderr, stepsUsed: step - 1 };
    }

    if (abortSignal?.aborted) {
      callbacks.onEvent({ type: 'user_takeover', reason: 'Aborted by user' });
      return { success: false, finalStderr: lastStderr, stepsUsed: step - 1 };
    }

    const applyRes = await callbacks.applyDiff(currentDiff, worktree.path);
    if (!applyRes.ok) {
      diffFailStreak++;
      callbacks.onEvent({
        type: 'diff_fail_streak_reached',
        count: diffFailStreak,
        lastError: applyRes.error,
      });

      if (diffFailStreak >= config.diffFailStreak) {
        return {
          success: false,
          finalStderr: `Diff apply failed ${diffFailStreak} times (streak cap). Last: ${applyRes.error}`,
          stepsUsed: step,
        };
      }

      currentDiff = await callbacks.onDiffApplyFailed(applyRes.error, currentDiff);
      continue;
    }
    callbacks.onEvent({ type: 'diff_applied', filePath: worktree.path });
    diffFailStreak = 0;

    callbacks.onEvent({ type: 'command_start', command: testCommand });
    const result = await runCmd(worktree, testCommand, config.commandTimeout);
    callbacks.onEvent({
      type: 'command_done',
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    });

    if (result.exitCode === 0) {
      callbacks.onEvent({ type: 'success' });
      return { success: true, stepsUsed: step };
    }

    if (result.stderr === lastStderr) {
      consecutiveSame++;
      callbacks.onEvent({ type: 'consecutive_same_error', count: consecutiveSame });
      if (consecutiveSame >= config.maxConsecutiveSameError) {
        callbacks.onEvent({
          type: 'user_takeover',
          reason: `Same error ${consecutiveSame} times in a row`,
        });
        return { success: false, finalStderr: result.stderr, stepsUsed: step };
      }
    } else {
      consecutiveSame = 0;
    }
    lastStderr = result.stderr;

    currentDiff = await callbacks.onCommandFailed(result.stderr, currentDiff);
  }

  callbacks.onEvent({ type: 'step_cap_reached' });
  return { success: false, finalStderr: lastStderr, stepsUsed: config.maxSteps };
}
```

- [ ] **Step 4: Update existing test "returns applyDiff error on first failure"**

The current test expects immediate failure after 1 apply error. With `diffFailStreak: 3` (default), it now retries. Change the test to supply 3 consecutive failures:

```ts
it('returns applyDiff error after diffFailStreak cap reached', async () => {
  const events: SelfHealEvent[] = [];
  const cbs = makeCallbacks({
    events,
    applyResults: [
      { ok: false, error: 'no_match' },
      { ok: false, error: 'no_match' },
      { ok: false, error: 'no_match' },
    ],
  });

  const result = await runSelfHealLoop(
    mockWt,
    'bad diff',
    'cmd',
    DEFAULT_SELF_HEAL_CONFIG,
    cbs,
    async () => ({ exitCode: 0, stdout: '', stderr: '' }),
  );

  expect(result.success).toBe(false);
  expect(result.finalStderr).toContain('streak cap');
  expect(result.finalStderr).toContain('no_match');
  const streakEvents = events.filter((e) => e.type === 'diff_fail_streak_reached');
  expect(streakEvents).toHaveLength(3);
  expect(cbs.onDiffApplyFailed).toHaveBeenCalledTimes(2);
});
```

Also update `makeCallbacks` helper at the top of the test file to include `onDiffApplyFailed`:

```ts
function makeCallbacks(opts: {
  applyResults?: Array<{ ok: true } | { ok: false; error: string }>;
  newDiffs?: string[];
  events: SelfHealEvent[];
}) {
  let applyIdx = 0;
  let diffIdx = 0;
  return {
    onEvent: (e: SelfHealEvent) => opts.events.push(e),
    onCommandFailed: vi.fn(async () => {
      const diff = opts.newDiffs?.[diffIdx++] ?? 'fallback diff';
      return diff;
    }),
    onDiffApplyFailed: vi.fn(async () => {
      const diff = opts.newDiffs?.[diffIdx++] ?? 'fallback diff after apply fail';
      return diff;
    }),
    applyDiff: vi.fn(async () => {
      const r = opts.applyResults?.[applyIdx++] ?? { ok: true as const };
      return r;
    }),
  };
}
```

- [ ] **Step 5: Add 2 new tests**

Append to `describe('runSelfHealLoop', ...)`:

```ts
it('retries diff on apply failure until success', async () => {
  const events: SelfHealEvent[] = [];
  const cbs = makeCallbacks({
    events,
    applyResults: [
      { ok: false, error: 'no_match' },
      { ok: false, error: 'no_match' },
      { ok: true },
    ],
  });

  const result = await runSelfHealLoop(
    mockWt,
    'bad diff',
    'cmd',
    DEFAULT_SELF_HEAL_CONFIG,
    cbs,
    async () => ({ exitCode: 0, stdout: 'pass', stderr: '' }),
  );

  expect(result.success).toBe(true);
  expect(result.stepsUsed).toBe(3);
  expect(cbs.onDiffApplyFailed).toHaveBeenCalledTimes(2);
  const streakEvents = events.filter((e) => e.type === 'diff_fail_streak_reached');
  expect(streakEvents).toHaveLength(2);
});

it('aborts when abortSignal already aborted', async () => {
  const events: SelfHealEvent[] = [];
  const cbs = makeCallbacks({ events });
  const controller = new AbortController();
  controller.abort();

  const result = await runSelfHealLoop(
    mockWt,
    'diff',
    'cmd',
    DEFAULT_SELF_HEAL_CONFIG,
    cbs,
    async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    controller.signal,
  );

  expect(result.success).toBe(false);
  expect(events.some((e) => e.type === 'user_takeover')).toBe(true);
  expect(result.stepsUsed).toBe(0);
});
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run packages/harness/tests/selfheal.test.ts`
Expected: all tests PASS (existing 5 + 1 updated + 2 new = 8 tests)

- [ ] **Step 7: Commit**

```bash
git add packages/harness/src/types.ts packages/harness/src/selfheal.ts packages/harness/tests/selfheal.test.ts
git commit -m "feat(harness): HARNESS-1 diffFailStreak guard + onDiffApplyFailed callback + abortSignal"
```

---

## Task 2: Extend `ApprovalDecision` with 3 new variants (TDD)

**Files:**

- Modify: `packages/agent/src/approval.ts`
- Test: `packages/agent/tests/approval.test.ts` (create if not exists; otherwise append)

- [ ] **Step 1: Check existing approval tests**

Run: `ls packages/agent/tests/`

If `approval.test.ts` exists, read it first to extend. If not, create new.

- [ ] **Step 2: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { ApprovalQueue } from '../src/approval.js';
import type { ApprovalDecision, ApprovalRequest } from '../src/approval.js';
import type { ParsedDiff } from '@awecode/diff';

const mockDiff: ParsedDiff = {
  filePath: 'foo.ts',
  blocks: [{ search: 'a\n', replace: 'b\n' }],
};

describe('ApprovalDecision type', () => {
  it('accepts 6 values: accept, reject, edit, skip, skip_all, accept_all, quit', () => {
    const decisions: ApprovalDecision[] = [
      'accept', 'reject', 'edit', 'skip',
      'skip_all', 'accept_all', 'quit',
    ];
    expect(decisions).toHaveLength(7);
    expect(new Set(decisions).size).toBe(7);
  });
});

describe('ApprovalQueue', () => {
  it('enqueue + dequeue', () => {
    const q = new ApprovalQueue();
    const req = q.enqueue(mockDiff);
    expect(q.pending).toHaveLength(1);
    expect(q.dequeue()?.id).toBe(req.id);
    expect(q.isEmpty).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify fail**

Run: `npx vitest run packages/agent/tests/approval.test.ts`
Expected: FAIL — type error on `'skip_all' | 'accept_all' | 'quit'` not assignable

- [ ] **Step 4: Extend `ApprovalDecision`**

In `packages/agent/src/approval.ts`:

```ts
export type ApprovalDecision =
  | 'accept'
  | 'reject'
  | 'edit'
  | 'skip'
  | 'skip_all'
  | 'accept_all'
  | 'quit';
```

- [ ] **Step 5: Run test to verify pass**

Run: `npx vitest run packages/agent/tests/approval.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/approval.ts packages/agent/tests/approval.test.ts
git commit -m "feat(agent): extend ApprovalDecision with skip_all/accept_all/quit"
```

---

## Task 3: Refactor `runChatLoop` to accept external messages ref (Q7/A)

**Files:**

- Modify: `packages/agent/src/chat.ts`
- Modify: `packages/agent/tests/chat.test.ts` (if exists, update; otherwise create smoke test)

- [ ] **Step 1: Read existing chat.ts and its tests**

Run: `ls packages/agent/tests/`

Read `packages/agent/src/chat.ts` and any existing test to understand current `messages` handling.

- [ ] **Step 2: Modify signature — accept `messages` ref**

Currently `runChatLoop(initialMessages, opts)` copies into internal array. Change to mutate the passed-in array:

```ts
export interface ChatLoopOptions {
  config: AwecodeConfig;
  context: ContextManager;
  systemPrompt?: string;
  maxIterations?: number;
  abortSignal?: AbortSignal;
  onToken?: (chunk: string) => void;
  onToolCall?: (name: string, args: unknown) => void;
  onToolResult?: (name: string, result: unknown) => void;
  onDiffDetected?: (diff: string) => void;
}

export async function runChatLoop(
  messages: ModelMessage[],
  opts: ChatLoopOptions,
): Promise<ModelMessage[]> {
  const providerConfig = opts.config.providers[opts.config.activeProvider];
  if (!providerConfig) {
    throw new Error(
      `Active provider "${opts.config.activeProvider}" not found in config`,
    );
  }
  const model = createProvider(providerConfig);

  // Seed the shared array with context entries (idempotent — caller may pre-seed)
  const contextMessages = opts.context.toMessages();
  for (const m of contextMessages) {
    if (!messages.some((existing) => existing === m)) {
      messages.push(m);
    }
  }

  const tools = buildToolSet(listToolDefinitions());
  const maxIter = opts.maxIterations ?? 20;

  for (let iter = 0; iter < maxIter; iter++) {
    if (opts.abortSignal?.aborted) break;

    const result = await streamText({
      model,
      messages,
      system: opts.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
      tools,
      maxOutputTokens: 4096,
      abortSignal: opts.abortSignal,
    });

    let assistantText = '';
    for await (const chunk of result.textStream) {
      assistantText += chunk;
      opts.onToken?.(chunk);
    }

    if (assistantText.includes('<<<< SEARCH')) {
      opts.onDiffDetected?.(assistantText);
    }

    messages.push({ role: 'assistant', content: assistantText });

    const toolCalls = await result.toolCalls;
    if (!toolCalls || toolCalls.length === 0) {
      break;
    }

    for (const call of toolCalls) {
      const normalized = normalizeToolCall(call);
      opts.onToolCall?.(normalized.name, normalized.arguments);
      const toolResult = await dispatchTool({
        name: normalized.name,
        arguments: normalized.arguments,
      });
      opts.onToolResult?.(normalized.name, toolResult);
      const toolCallId = normalized.id ?? `call-${iter}-${normalized.name}`;
      messages.push({
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId,
            toolName: normalized.name,
            output: { type: 'text', value: JSON.stringify(toolResult) },
          },
        ],
      });
    }
  }

  return messages;
}
```

Note: `normalizeToolCall`, `buildToolSet`, `NormalizedToolCall` helpers stay unchanged.

- [ ] **Step 3: Run existing chat tests**

Run: `npx vitest run packages/agent/tests/`
Expected: existing tests may need adjustment — they pass `initialMessages` positionally. Update any callers to pass the same array they want mutated back.

- [ ] **Step 4: Commit**

```bash
git add packages/agent/src/chat.ts packages/agent/tests/
git commit -m "refactor(agent): runChatLoop mutates external messages ref (Q7/A)"
```

---

## Task 4: Scaffold `@awecode/orchestrator` package

**Files:**

- Create: `packages/orchestrator/{package.json,tsconfig.json,tsup.config.ts,src/index.ts,tests/sanity.test.ts}`
- Modify: `tsconfig.json` (root)

- [ ] **Step 1: Create `packages/orchestrator/package.json`**

```json
{
  "name": "@awecode/orchestrator",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@awecode/agent": "workspace:*",
    "@awecode/diff": "workspace:*",
    "@awecode/harness": "workspace:*"
  }
}
```

- [ ] **Step 2: Create `packages/orchestrator/tsconfig.json`**

Mirror `packages/harness/tsconfig.json` exactly (extends base, typeRoots/types node, ignoreDeprecations 6.0):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "typeRoots": ["../../node_modules/@types"],
    "types": ["node"],
    "ignoreDeprecations": "6.0"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "tests"]
}
```

- [ ] **Step 3: Create `packages/orchestrator/tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  dts: true,
});
```

- [ ] **Step 4: Create `packages/orchestrator/src/index.ts`** with Apache header

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

export const ORCHESTRATOR_PACKAGE_VERSION = '0.0.0';
```

- [ ] **Step 5: Create `packages/orchestrator/tests/sanity.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { ORCHESTRATOR_PACKAGE_VERSION } from '../src/index.js';

describe('sanity', () => {
  it('exports version', () => {
    expect(ORCHESTRATOR_PACKAGE_VERSION).toBe('0.0.0');
  });
});
```

- [ ] **Step 6: Install deps + add workspace reference**

Run: `yarn install` (registers new workspace)
Run: `yarn workspace @awecode/orchestrator add -D tsup vitest typescript @types/node`

- [ ] **Step 7: Add to root `tsconfig.json`**

Append `{ "path": "packages/orchestrator" }` to `references` array (preserve all 6 existing refs: llm, cli, diff, tools, agent, harness).

- [ ] **Step 8: Run sanity test**

Run: `npx vitest run packages/orchestrator/tests/sanity.test.ts`
Expected: `1 passed`

- [ ] **Step 9: Commit**

```bash
git add packages/orchestrator/ tsconfig.json
git commit -m "feat(orchestrator): scaffold @awecode/orchestrator package"
```

---

## Task 5: `TestCommandDetector` (TDD)

**Files:**

- Create: `packages/orchestrator/src/test-detect.ts`
- Test: `packages/orchestrator/tests/test-detect.test.ts`
- Modify: `packages/orchestrator/src/index.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectTestCommand } from '../src/test-detect.js';

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'awecode-testdetect-'));
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

describe('detectTestCommand', () => {
  it('returns null on empty repo', async () => {
    const r = await detectTestCommand(tmpRoot);
    expect(r).toBeNull();
  });

  it('detects yarn test when package.json has scripts.test + yarn.lock', async () => {
    await writeFile(
      join(tmpRoot, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest run' } }),
    );
    await writeFile(join(tmpRoot, 'yarn.lock'), '');
    const r = await detectTestCommand(tmpRoot);
    expect(r?.command).toBe('yarn test');
    expect(r?.reason).toMatch(/package\.json/i);
  });

  it('detects npm test when package.json has scripts.test but no yarn.lock', async () => {
    await writeFile(
      join(tmpRoot, 'package.json'),
      JSON.stringify({ scripts: { test: 'jest' } }),
    );
    const r = await detectTestCommand(tmpRoot);
    expect(r?.command).toBe('npm test');
  });

  it('returns null when scripts.test is "echo no test"', async () => {
    await writeFile(
      join(tmpRoot, 'package.json'),
      JSON.stringify({ scripts: { test: 'echo "no test"' } }),
    );
    const r = await detectTestCommand(tmpRoot);
    expect(r).toBeNull();
  });

  it('detects cargo test when Cargo.toml exists', async () => {
    await writeFile(join(tmpRoot, 'Cargo.toml'), '[package]\nname = "x"\n');
    const r = await detectTestCommand(tmpRoot);
    expect(r?.command).toBe('cargo test');
  });

  it('detects go test when go.mod exists', async () => {
    await writeFile(join(tmpRoot, 'go.mod'), 'module x\n\ngo 1.20\n');
    const r = await detectTestCommand(tmpRoot);
    expect(r?.command).toBe('go test ./...');
  });

  it('prefers Cargo over Node when both exist', async () => {
    await writeFile(join(tmpRoot, 'Cargo.toml'), '[package]\nname = "x"\n');
    await writeFile(
      join(tmpRoot, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest' } }),
    );
    const r = await detectTestCommand(tmpRoot);
    expect(r?.command).toBe('cargo test');
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `npx vitest run packages/orchestrator/tests/test-detect.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create `packages/orchestrator/src/test-detect.ts`** with Apache header

```ts
// <Apache 2.0 header — copy verbatim from packages/diff/src/index.ts:1-13>

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface DetectedTestCommand {
  command: string;
  reason: string;
}

export async function detectTestCommand(
  projectRoot: string,
): Promise<DetectedTestCommand | null> {
  // 1. Node.js — package.json with non-empty scripts.test
  try {
    const pkgRaw = await readFile(join(projectRoot, 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgRaw) as { scripts?: { test?: string } };
    const testScript = pkg.scripts?.test;
    if (testScript && testScript.trim() !== '' && !testScript.includes('echo "no test"') && !testScript.includes('echo no test')) {
      let hasYarn = false;
      try {
        await readFile(join(projectRoot, 'yarn.lock'));
        hasYarn = true;
      } catch {
        // npm project
      }
      return {
        command: hasYarn ? 'yarn test' : 'npm test',
        reason: 'package.json scripts.test exists',
      };
    }
  } catch {
    // no package.json
  }

  // 2. Rust — Cargo.toml
  try {
    await readFile(join(projectRoot, 'Cargo.toml'));
    return { command: 'cargo test', reason: 'Cargo.toml exists' };
  } catch {
    // not rust
  }

  // 3. Python — pytest.ini or pyproject.toml with [tool.pytest]
  try {
    await readFile(join(projectRoot, 'pytest.ini'));
    return { command: 'pytest', reason: 'pytest.ini exists' };
  } catch {
    // no pytest.ini
  }
  try {
    const pyproject = await readFile(join(projectRoot, 'pyproject.toml'), 'utf-8');
    if (pyproject.includes('[tool.pytest]') || pyproject.includes('[tool.pytest.ini_options]')) {
      return { command: 'pytest', reason: 'pyproject.toml has pytest config' };
    }
  } catch {
    // no pyproject
  }

  // 4. Go — go.mod
  try {
    await readFile(join(projectRoot, 'go.mod'));
    return { command: 'go test ./...', reason: 'go.mod exists' };
  } catch {
    // not go
  }

  // 5. Makefile with test target
  try {
    const makefile = await readFile(join(projectRoot, 'Makefile'), 'utf-8');
    if (/^test:/m.test(makefile)) {
      return { command: 'make test', reason: 'Makefile has test target' };
    }
  } catch {
    // no Makefile
  }

  return null;
}
```

- [ ] **Step 4: Update `packages/orchestrator/src/index.ts`** — add export

```ts
export { detectTestCommand } from './test-detect.js';
export type { DetectedTestCommand } from './test-detect.js';
```

- [ ] **Step 5: Run test to verify pass**

Run: `npx vitest run packages/orchestrator/tests/test-detect.test.ts`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add packages/orchestrator/src/test-detect.ts packages/orchestrator/tests/test-detect.test.ts packages/orchestrator/src/index.ts
git commit -m "feat(orchestrator): detectTestCommand auto-detects test cmd from repo"
```

---

## Task 6: `DiffInterceptor` (TDD)

**Files:**

- Create: `packages/orchestrator/src/diff-interceptor.ts`
- Test: `packages/orchestrator/tests/diff-interceptor.test.ts`
- Modify: `packages/orchestrator/src/index.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { parseAssistantDiff } from '../src/diff-interceptor.js';

describe('parseAssistantDiff', () => {
  it('returns empty array when no diff blocks in text', () => {
    const r = parseAssistantDiff('just regular text, no diff');
    expect(r).toEqual([]);
  });

  it('parses single diff block', () => {
    const text = `file_path: foo.ts
<<<< SEARCH
old
====
new
>>>> REPLACE`;
    const r = parseAssistantDiff(text);
    expect(r).toHaveLength(1);
    expect(r[0]?.filePath).toBe('foo.ts');
    expect(r[0]?.parsed.filePath).toBe('foo.ts');
    expect(r[0]?.parsed.blocks).toHaveLength(1);
    expect(r[0]?.parsed.blocks[0]?.search).toBe('old\n');
    expect(r[0]?.parsed.blocks[0]?.replace).toBe('new\n');
  });

  it('parses multiple diff blocks for different files', () => {
    const text = `file_path: a.ts
<<<< SEARCH
x
====
y
>>>> REPLACE
file_path: b.ts
<<<< SEARCH
p
====
q
>>>> REPLACE`;
    const r = parseAssistantDiff(text);
    expect(r).toHaveLength(2);
    expect(r[0]?.filePath).toBe('a.ts');
    expect(r[1]?.filePath).toBe('b.ts');
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `npx vitest run packages/orchestrator/tests/diff-interceptor.test.ts`
Expected: FAIL

- [ ] **Step 3: Create `packages/orchestrator/src/diff-interceptor.ts`**

```ts
// <Apache 2.0 header>

import { parseDiff } from '@awecode/diff';
import type { ParsedDiff } from '@awecode/diff';

export interface ParsedDiffBlock {
  text: string;
  filePath: string;
  parsed: ParsedDiff;
}

const FILE_PATH_PREFIX = 'file_path:';

/**
 * Extracts diff blocks from assistant text. Each block starts with
 * `file_path: <path>` followed by `<<<< SEARCH ... ==== ... >>>> REPLACE`.
 *
 * Strategy: split on `file_path:` occurrences, parse each chunk via
 * `parseDiff` from `@awecode/diff`. If a chunk has no SEARCH/REPLACE markers,
 * it's skipped (e.g. leading prose before the first diff).
 */
export function parseAssistantDiff(text: string): ParsedDiffBlock[] {
  const blocks: ParsedDiffBlock[] = [];

  // Find all positions of "file_path:" — each starts a potential diff block
  let pos = 0;
  while (pos < text.length) {
    const nextIdx = text.indexOf(FILE_PATH_PREFIX, pos);
    if (nextIdx === -1) break;

    // Find the next file_path or end of text
    const afterCurrent = nextIdx + FILE_PATH_PREFIX.length;
    const nextFileIdx = text.indexOf(FILE_PATH_PREFIX, afterCurrent);
    const chunkEnd = nextFileIdx === -1 ? text.length : nextFileIdx;
    const chunk = text.slice(nextIdx, chunkEnd);

    // Parse the chunk — needs both file_path line and SEARCH/REPLACE markers
    if (chunk.includes('<<<< SEARCH') && chunk.includes('>>>> REPLACE')) {
      const parsed = parseDiff(chunk);
      if (parsed.filePath) {
        blocks.push({
          text: chunk,
          filePath: parsed.filePath,
          parsed,
        });
      }
    }

    pos = afterCurrent;
  }

  return blocks;
}
```

- [ ] **Step 4: Update `packages/orchestrator/src/index.ts`**

```ts
export { parseAssistantDiff } from './diff-interceptor.js';
export type { ParsedDiffBlock } from './diff-interceptor.js';
```

- [ ] **Step 5: Run test to verify pass**

Run: `npx vitest run packages/orchestrator/tests/diff-interceptor.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/orchestrator/src/diff-interceptor.ts packages/orchestrator/tests/diff-interceptor.test.ts packages/orchestrator/src/index.ts
git commit -m "feat(orchestrator): parseAssistantDiff extracts diff blocks from LLM text"
```

---

## Task 7: `ApprovalPrompter` (TDD)

**Files:**

- Create: `packages/orchestrator/src/approval.ts`
- Test: `packages/orchestrator/tests/approval.test.ts`
- Modify: `packages/orchestrator/src/index.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { ApprovalPrompter } from '../src/approval.js';
import { ApprovalQueue } from '@awecode/agent';
import type { ParsedDiffBlock } from '../src/diff-interceptor.js';
import * as readline from 'node:readline/promises';

const mockBlock: ParsedDiffBlock = {
  text: 'file_path: foo.ts\n<<<< SEARCH\na\n====\nb\n>>>> REPLACE',
  filePath: 'foo.ts',
  parsed: {
    filePath: 'foo.ts',
    blocks: [{ search: 'a\n', replace: 'b\n' }],
  },
};

vi.mock('node:readline/promises', () => ({
  default: {
    createInterface: vi.fn(),
  },
}));

describe('ApprovalPrompter', () => {
  it('returns accept when user types y', async () => {
    const rl = { question: vi.fn().mockResolvedValue('y\n'), close: vi.fn() };
    vi.mocked(readline.default.createInterface).mockReturnValue(rl as any);

    const prompter = new ApprovalPrompter(new ApprovalQueue());
    const decision = await prompter.prompt(mockBlock);
    expect(decision).toBe('accept');
    expect(rl.close).toHaveBeenCalled();
  });

  it('returns reject when user types n', async () => {
    const rl = { question: vi.fn().mockResolvedValue('n\n'), close: vi.fn() };
    vi.mocked(readline.default.createInterface).mockReturnValue(rl as any);

    const prompter = new ApprovalPrompter(new ApprovalQueue());
    const decision = await prompter.prompt(mockBlock);
    expect(decision).toBe('reject');
  });

  it('returns quit when user types q', async () => {
    const rl = { question: vi.fn().mockResolvedValue('q\n'), close: vi.fn() };
    vi.mocked(readline.default.createInterface).mockReturnValue(rl as any);

    const prompter = new ApprovalPrompter(new ApprovalQueue());
    const decision = await prompter.prompt(mockBlock);
    expect(decision).toBe('quit');
  });

  it('returns accept_all when user types a', async () => {
    const rl = { question: vi.fn().mockResolvedValue('a\n'), close: vi.fn() };
    vi.mocked(readline.default.createInterface).mockReturnValue(rl as any);

    const prompter = new ApprovalPrompter(new ApprovalQueue());
    const decision = await prompter.prompt(mockBlock);
    expect(decision).toBe('accept_all');
  });

  it('returns skip_all when user types s', async () => {
    const rl = { question: vi.fn().mockResolvedValue('s\n'), close: vi.fn() };
    vi.mocked(readline.default.createInterface).mockReturnValue(rl as any);

    const prompter = new ApprovalPrompter(new ApprovalQueue());
    const decision = await prompter.prompt(mockBlock);
    expect(decision).toBe('skip_all');
  });

  it('returns edit when user types e', async () => {
    const rl = { question: vi.fn().mockResolvedValue('e\n'), close: vi.fn() };
    vi.mocked(readline.default.createInterface).mockReturnValue(rl as any);

    const prompter = new ApprovalPrompter(new ApprovalQueue());
    const decision = await prompter.prompt(mockBlock);
    expect(decision).toBe('edit');
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `npx vitest run packages/orchestrator/tests/approval.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create `packages/orchestrator/src/approval.ts`**

```ts
// <Apache 2.0 header>

import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import type { ApprovalDecision } from '@awecode/agent';
import type { ParsedDiffBlock } from './diff-interceptor.js';

export interface ApprovalPrompterOptions {
  abortSignal?: AbortSignal;
}

const KEY_MAP: Record<string, ApprovalDecision> = {
  y: 'accept',
  n: 'reject',
  e: 'edit',
  s: 'skip_all',
  a: 'accept_all',
  q: 'quit',
};

export class ApprovalPrompter {
  constructor(
    private opts: ApprovalPrompterOptions = {},
  ) {}

  async prompt(block: ParsedDiffBlock): Promise<ApprovalDecision> {
    const rl = readline.createInterface({ input, output });
    try {
      console.log(`\n--- Diff for ${block.filePath} ---`);
      console.log(block.text);
      const answer = await rl.question('Approve? [y]es / [n]o / [e]dit / [s]kip-all / [a]ccept-all / [q]uit: ');
      const key = answer.trim().toLowerCase().charAt(0);
      return KEY_MAP[key] ?? 'reject';
    } finally {
      rl.close();
    }
  }
}
```

- [ ] **Step 4: Update `packages/orchestrator/src/index.ts`**

```ts
export { ApprovalPrompter } from './approval.js';
export type { ApprovalPrompterOptions } from './approval.js';
```

- [ ] **Step 5: Run test to verify pass**

Run: `npx vitest run packages/orchestrator/tests/approval.test.ts`
Expected: all 6 tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/orchestrator/src/approval.ts packages/orchestrator/tests/approval.test.ts packages/orchestrator/src/index.ts
git commit -m "feat(orchestrator): ApprovalPrompter with 6 keystroke decisions"
```

---

## Task 8: `Orchestrator` class — Phase 1 (Parse + Approve ALL) (TDD)

**Files:**

- Create: `packages/orchestrator/src/types.ts`
- Create: `packages/orchestrator/src/orchestrator.ts` (partial)
- Test: `packages/orchestrator/tests/orchestrator.test.ts`
- Modify: `packages/orchestrator/src/index.ts`

- [ ] **Step 1: Create `packages/orchestrator/src/types.ts`**

```ts
// <Apache 2.0 header>

import type { ModelMessage } from 'ai';
import type { ContextManager, ApprovalQueue, ApprovalDecision } from '@awecode/agent';
import type { SelfHealConfig, SelfHealEvent, Worktree, CommitStrategy } from '@awecode/harness';

export type OrchestratorPhase =
  | 'idle'
  | 'parsing'
  | 'approving'
  | 'creating_worktree'
  | 'applying_diff'
  | 'self_healing'
  | 'merging'
  | 'committing'
  | 'cleaning_up'
  | 'success'
  | 'failed'
  | 'aborted';

export interface OrchestratorOptions {
  projectRoot: string;
  context: ContextManager;
  approvalQueue: ApprovalQueue;
  selfHealConfig?: SelfHealConfig;
  commitStrategy?: CommitStrategy;
  taskUuid: string;
  abortSignal?: AbortSignal;
  chatMessages: ModelMessage[];
  onWorktreeCreated?: (wt: Worktree) => void;
  onSelfHealEvent?: (e: SelfHealEvent) => void;
  onApprovalRequest?: (req: { filePath: string }) => void;
  onApprovalDecision?: (decision: ApprovalDecision) => void;
  onPhaseChange?: (phase: OrchestratorPhase) => void;
}

export interface DiffCycleResult {
  success: boolean;
  mergedFiles: string[];
  worktreeUuid?: string;
  error?: string;
  phase: OrchestratorPhase;
}
```

- [ ] **Step 2: Write failing test for Phase 1 (parsing + approving)**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { Orchestrator } from '../src/orchestrator.js';
import { ApprovalQueue, ContextManager } from '@awecode/agent';
import * as readline from 'node:readline/promises';

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'awecode-orch-'));
  const git = simpleGit(tmpRoot);
  await git.init();
  await git.addConfig('user.email', 'test@test.com');
  await git.addConfig('user.name', 'Test');
  await writeFile(join(tmpRoot, '.gitattributes'), '* text=auto eol=lf\n');
  await writeFile(join(tmpRoot, 'foo.ts'), 'old\n', 'utf-8');
  await git.add('.');
  await git.commit('initial');
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

vi.mock('node:readline/promises', () => ({
  default: {
    createInterface: vi.fn(),
  },
}));

describe('Orchestrator.handleDiffDetected - Phase 1', () => {
  it('parses single block + approve → proceeds to pipeline', async () => {
    const rl = { question: vi.fn().mockResolvedValue('y\n'), close: vi.fn() };
    vi.mocked(readline.default.createInterface).mockReturnValue(rl as any);

    const phases: string[] = [];
    const ctx = new ContextManager();
    const orch = new Orchestrator({
      projectRoot: tmpRoot,
      context: ctx,
      approvalQueue: new ApprovalQueue(),
      taskUuid: 'task-test-1',
      chatMessages: [],
      onPhaseChange: (p) => phases.push(p),
    });

    const diffText = `file_path: foo.ts
<<<< SEARCH
old
====
new
>>>> REPLACE`;

    const result = await orch.handleDiffDetected(diffText);
    expect(result.success).toBe(true);
    expect(phases).toContain('parsing');
    expect(phases).toContain('approving');
    expect(phases).toContain('success');
  });

  it('quits immediately when user types q in approval', async () => {
    const rl = { question: vi.fn().mockResolvedValue('q\n'), close: vi.fn() };
    vi.mocked(readline.default.createInterface).mockReturnValue(rl as any);

    const phases: string[] = [];
    const ctx = new ContextManager();
    const orch = new Orchestrator({
      projectRoot: tmpRoot,
      context: ctx,
      approvalQueue: new ApprovalQueue(),
      taskUuid: 'task-test-2',
      chatMessages: [],
      onPhaseChange: (p) => phases.push(p),
    });

    const result = await orch.handleDiffDetected(
      `file_path: foo.ts\n<<<< SEARCH\nold\n====\nnew\n>>>> REPLACE`,
    );

    expect(result.success).toBe(false);
    expect(result.phase).toBe('aborted');
    expect(phases).not.toContain('creating_worktree');
  });
});
```

- [ ] **Step 3: Run test to verify fail**

Run: `npx vitest run packages/orchestrator/tests/orchestrator.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Create `packages/orchestrator/src/orchestrator.ts`** (Phase 1 only — full implementation in Task 9)

```ts
// <Apache 2.0 header>

import { parseAssistantDiff } from './diff-interceptor.js';
import { ApprovalPrompter } from './approval.js';
import { detectTestCommand } from './test-detect.js';
import type {
  OrchestratorOptions,
  OrchestratorPhase,
  DiffCycleResult,
} from './types.js';
import type { ApprovalDecision } from '@awecode/agent';
import type { ParsedDiffBlock } from './diff-interceptor.js';

export class Orchestrator {
  private phase: OrchestratorPhase = 'idle';
  private abortFlag = false;

  constructor(private opts: OrchestratorOptions) {}

  private setPhase(p: OrchestratorPhase): void {
    this.phase = p;
    this.opts.onPhaseChange?.(p);
  }

  async handleDiffDetected(diffText: string): Promise<DiffCycleResult> {
    this.setPhase('parsing');
    const blocks = parseAssistantDiff(diffText);
    if (blocks.length === 0) {
      return {
        success: false,
        mergedFiles: [],
        error: 'No diff blocks found',
        phase: 'failed',
      };
    }

    // Phase 1: approve ALL blocks before pipeline runs (Q9/B)
    this.setPhase('approving');
    const prompter = new ApprovalPrompter({ abortSignal: this.opts.abortSignal });
    const approvedBlocks: ParsedDiffBlock[] = [];
    let acceptAll = false;

    for (const block of blocks) {
      if (this.abortFlag || this.opts.abortSignal?.aborted) {
        return {
          success: false,
          mergedFiles: [],
          phase: 'aborted',
        };
      }

      let decision: ApprovalDecision;
      if (acceptAll) {
        decision = 'accept';
      } else {
        this.opts.onApprovalRequest?.({ filePath: block.filePath });
        decision = await prompter.prompt(block);
        this.opts.onApprovalDecision?.(decision);
      }

      switch (decision) {
        case 'accept':
          approvedBlocks.push(block);
          break;
        case 'accept_all':
          acceptAll = true;
          approvedBlocks.push(block);
          break;
        case 'reject':
          // skip this block
          break;
        case 'edit':
          // v0.1: treat as accept (real edit UI in Plan 5b)
          approvedBlocks.push(block);
          break;
        case 'skip_all':
          // exit approval phase with whatever's approved so far
          return await this.runPipeline(approvedBlocks);
        case 'quit':
          this.abortFlag = true;
          return {
            success: false,
            mergedFiles: [],
            phase: 'aborted',
          };
      }
    }

    return await this.runPipeline(approvedBlocks);
  }

  private async runPipeline(
    blocks: ParsedDiffBlock[],
  ): Promise<DiffCycleResult> {
    if (blocks.length === 0) {
      return {
        success: false,
        mergedFiles: [],
        error: 'No blocks approved',
        phase: 'failed',
      };
    }

    // Pipeline stub — full impl in Task 9
    // For Phase 1 test, just succeed without doing git work
    this.setPhase('success');
    return {
      success: true,
      mergedFiles: blocks.map((b) => b.filePath),
      phase: 'success',
    };
  }

  async abort(): Promise<void> {
    this.abortFlag = true;
  }
}
```

- [ ] **Step 5: Update `packages/orchestrator/src/index.ts`**

```ts
export { Orchestrator } from './orchestrator.js';
export type {
  OrchestratorPhase,
  OrchestratorOptions,
  DiffCycleResult,
} from './types.js';
```

- [ ] **Step 6: Run test to verify pass**

Run: `npx vitest run packages/orchestrator/tests/orchestrator.test.ts`
Expected: 2 tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/orchestrator/src/types.ts packages/orchestrator/src/orchestrator.ts packages/orchestrator/tests/orchestrator.test.ts packages/orchestrator/src/index.ts
git commit -m "feat(orchestrator): Orchestrator Phase 1 (parse + approve-all)"
```

---

## Task 9: `Orchestrator` class — Phase 2 (Pipeline: worktree → apply → self-heal → merge → commit) (TDD)

**Files:**

- Modify: `packages/orchestrator/src/orchestrator.ts` (replace `runPipeline` stub)
- Modify: `packages/orchestrator/tests/orchestrator.test.ts` (add pipeline tests)

- [ ] **Step 1: Add failing tests for pipeline**

Append to `describe('Orchestrator.handleDiffDetected - Phase 1', ...)`:

```ts
describe('Orchestrator.handleDiffDetected - Phase 2 (pipeline)', () => {
  it('creates worktree, applies diff, self-heals (mock runCmd), merges, commits', async () => {
    const rl = { question: vi.fn().mockResolvedValue('y\n'), close: vi.fn() };
    vi.mocked(readline.default.createInterface).mockReturnValue(rl as any);

    const phases: string[] = [];
    const ctx = new ContextManager();
    const events: any[] = [];

    const orch = new Orchestrator({
      projectRoot: tmpRoot,
      context: ctx,
      approvalQueue: new ApprovalQueue(),
      taskUuid: 'task-pipe-1',
      chatMessages: [],
      selfHealConfig: {
        maxSteps: 3,
        maxConsecutiveSameError: 2,
        totalTimeout: 300_000,
        commandTimeout: 60_000,
        diffFailStreak: 3,
      },
      onPhaseChange: (p) => phases.push(p),
      onSelfHealEvent: (e) => events.push(e),
      runCommandOverride: async () => ({ exitCode: 0, stdout: 'pass', stderr: '' }),
    });

    const result = await orch.handleDiffDetected(
      `file_path: foo.ts\n<<<< SEARCH\nold\n====\nnew\n>>>> REPLACE`,
    );

    expect(result.success).toBe(true);
    expect(phases).toContain('creating_worktree');
    expect(phases).toContain('applying_diff');
    expect(phases).toContain('self_healing');
    expect(phases).toContain('merging');
    expect(phases).toContain('committing');
    expect(phases).toContain('cleaning_up');
    expect(events.some((e) => e.type === 'success')).toBe(true);

    // Verify file is updated in working dir
    const updated = await readFile(join(tmpRoot, 'foo.ts'), 'utf-8');
    expect(updated).toBe('new\n');

    // Verify commit message
    const git = simpleGit(tmpRoot);
    const log = await git.log();
    expect(log.latest?.message).toContain('awecode: task-pipe-1');
  });

  it('injects feedback message on apply failure (Q7/A)', async () => {
    const rl = { question: vi.fn().mockResolvedValue('y\n'), close: vi.fn() };
    vi.mocked(readline.default.createInterface).mockReturnValue(rl as any);

    const chatMessages: any[] = [];
    const ctx = new ContextManager();

    const orch = new Orchestrator({
      projectRoot: tmpRoot,
      context: ctx,
      approvalQueue: new ApprovalQueue(),
      taskUuid: 'task-fail-1',
      chatMessages,
      selfHealConfig: {
        maxSteps: 3,
        maxConsecutiveSameError: 2,
        totalTimeout: 300_000,
        commandTimeout: 60_000,
        diffFailStreak: 2,
      },
      applyDiffOverride: async () => ({ ok: false, error: 'no_match' }),
      runCommandOverride: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    });

    const result = await orch.handleDiffDetected(
      `file_path: foo.ts\n<<<< SEARCH\nold\n====\nnew\n>>>> REPLACE`,
    );

    expect(result.success).toBe(false);
    expect(result.phase).toBe('failed');
    // After 2 apply fails, message should be injected
    expect(chatMessages.some((m) => typeof m.content === 'string' && m.content.includes('apply failed'))).toBe(true);
  });
});
```

Also add imports to test file:

```ts
import { readFile } from 'node:fs/promises';
```

Add `runCommandOverride` and `applyDiffOverride` to `OrchestratorOptions` (test-only injection seams):

```ts
// in types.ts
export interface OrchestratorOptions {
  // ... existing
  runCommandOverride?: (wt: Worktree, cmd: string, timeoutMs?: number) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
  applyDiffOverride?: (diff: string, worktreePath: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}
```

- [ ] **Step 2: Run test to verify fail**

Run: `npx vitest run packages/orchestrator/tests/orchestrator.test.ts`
Expected: FAIL — pipeline stub doesn't do work

- [ ] **Step 3: Replace `runPipeline` stub with full impl**

In `packages/orchestrator/src/orchestrator.ts`:

```ts
import {
  createWorktree,
  removeWorktree,
  runSelfHealLoop,
  mergeToWorkingDir,
  commitDiff,
  runCommand,
  DEFAULT_SELF_HEAL_CONFIG,
} from '@awecode/harness';
import { applyDiff } from '@awecode/diff';
import type {
  Worktree,
  SelfHealEvent,
  SelfHealCallbacks,
  RunCommandFn,
} from '@awecode/harness';

// ... in class:

private async runPipeline(
  blocks: ParsedDiffBlock[],
): Promise<DiffCycleResult> {
  if (blocks.length === 0) {
    return {
      success: false,
      mergedFiles: [],
      error: 'No blocks approved',
      phase: 'failed',
    };
  }

  // Detect test command once per task (cached on this)
  if (!this.cachedTestCmd) {
    const detected = await detectTestCommand(this.opts.projectRoot);
    this.cachedTestCmd = detected;
  }

  // Create worktree (1 per cycle, reused across blocks)
  this.setPhase('creating_worktree');
  let wt: Worktree;
  try {
    wt = await createWorktree(this.opts.projectRoot);
    this.opts.onWorktreeCreated?.(wt);
  } catch (err) {
    return {
      success: false,
      mergedFiles: [],
      error: `createWorktree failed: ${(err as Error).message}`,
      phase: 'failed',
    };
  }

  const mergedFiles: string[] = [];

  const runCmd: RunCommandFn = this.opts.runCommandOverride ?? runCommand;
  const applyDiffFn = this.opts.applyDiffOverride ?? (async (diff, path) => {
    const r = await applyDiff(diff, path);
    return r.ok ? { ok: true } : { ok: false, error: 'apply failed' };
  });

  try {
    for (const block of blocks) {
      if (this.abortFlag || this.opts.abortSignal?.aborted) {
        return { success: false, mergedFiles, phase: 'aborted' };
      }

      this.setPhase('applying_diff');
      // (apply happens inside self-heal loop, not separately)

      this.setPhase('self_healing');
      const testCmd = this.cachedTestCmd?.command ?? 'true'; // 'true' = no-op pass

      const callbacks: SelfHealCallbacks = {
        onEvent: (e: SelfHealEvent) => this.opts.onSelfHealEvent?.(e),
        onCommandFailed: async (stderr, lastDiff) => {
          // Q7/A: inject feedback message for LLM to regenerate
          this.opts.chatMessages.push({
            role: 'user',
            content: `The test command failed with:\n${stderr}\n\nLast diff:\n${lastDiff}\n\nPlease generate a new diff to fix this.`,
          });
          return `[awaiting LLM regeneration in next iteration]`;
        },
        onDiffApplyFailed: async (error, lastDiff) => {
          this.opts.chatMessages.push({
            role: 'user',
            content: `Diff apply failed: ${error}\n\nLast diff:\n${lastDiff}\n\nPlease generate a new diff.`,
          });
          return `[awaiting LLM regeneration in next iteration]`;
        },
        applyDiff: applyDiffFn,
      };

      const healResult = await runSelfHealLoop(
        wt,
        block.text,
        testCmd,
        this.opts.selfHealConfig ?? DEFAULT_SELF_HEAL_CONFIG,
        callbacks,
        runCmd,
        this.opts.abortSignal,
      );

      if (!healResult.success) {
        return {
          success: false,
          mergedFiles,
          worktreeUuid: wt.uuid,
          error: healResult.finalStderr,
          phase: 'failed',
        };
      }

      this.setPhase('merging');
      const mergeResult = await mergeToWorkingDir(
        this.opts.projectRoot,
        wt,
        { mode: 'git-merge' },
      );
      if (!mergeResult.ok) {
        // Q8/B: keep worktree, let caller decide
        return {
          success: false,
          mergedFiles,
          worktreeUuid: wt.uuid,
          error: `Merge conflict: ${mergeResult.error}`,
          phase: 'failed',
        };
      }

      this.setPhase('committing');
      await commitDiff(this.opts.projectRoot, block.parsed, {
        strategy: this.opts.commitStrategy ?? 'per-task',
        taskUuid: this.opts.taskUuid,
      });
      mergedFiles.push(block.filePath);
    }

    this.setPhase('cleaning_up');
    await removeWorktree(this.opts.projectRoot, wt.uuid);

    this.setPhase('success');
    return {
      success: true,
      mergedFiles,
      worktreeUuid: wt.uuid,
      phase: 'success',
    };
  } catch (err) {
    return {
      success: false,
      mergedFiles,
      worktreeUuid: wt.uuid,
      error: (err as Error).message,
      phase: 'failed',
    };
  }
}

private cachedTestCmd: { command: string; reason: string } | null | undefined;
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run packages/orchestrator/tests/orchestrator.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/orchestrator/src/orchestrator.ts packages/orchestrator/src/types.ts packages/orchestrator/tests/orchestrator.test.ts
git commit -m "feat(orchestrator): full pipeline (worktree + self-heal + merge + commit)"
```

---

## Task 10: CLI wiring — chat command

**Files:**

- Modify: `packages/cli/src/commands/chat.ts`
- Modify: `packages/cli/package.json`

- [ ] **Step 1: Add `@awecode/orchestrator` dep**

Run: `yarn workspace @awecode/cli add @awecode/orchestrator`

- [ ] **Step 2: Read existing `chat.ts`**

Read `packages/cli/src/commands/chat.ts` to understand current structure (from Plan 3).

- [ ] **Step 3: Wire Orchestrator + AbortController**

In `packages/cli/src/commands/chat.ts`, modify the `chatCommand` to:

```ts
import { Orchestrator } from '@awecode/orchestrator';
import { ApprovalQueue, ContextManager, runChatLoop } from '@awecode/agent';
import { randomUUID } from 'node:crypto';
import type { ModelMessage } from 'ai';
// ... existing imports

export async function chatCommand(initialPrompt?: string): Promise<void> {
  const controller = new AbortController();
  process.on('SIGINT', () => {
    if (!controller.signal.aborted) controller.abort();
  });

  // ... existing config loading ...

  const messages: ModelMessage[] = [];
  if (initialPrompt) {
    messages.push({ role: 'user', content: initialPrompt });
  }

  const context = new ContextManager();
  const orchestrator = new Orchestrator({
    projectRoot: process.cwd(),
    context,
    approvalQueue: new ApprovalQueue(),
    taskUuid: randomUUID(),
    abortSignal: controller.signal,
    chatMessages: messages,
    onSelfHealEvent: (e) => console.log(`[self-heal] ${e.type}`),
    onPhaseChange: (p) => console.log(`[orchestrator] phase: ${p}`),
    onApprovalDecision: (d) => console.log(`[approval] ${d}`),
  });

  await runChatLoop(messages, {
    config,
    context,
    abortSignal: controller.signal,
    onToken: (chunk) => process.stdout.write(chunk),
    onDiffDetected: async (text) => {
      const result = await orchestrator.handleDiffDetected(text);
      if (!result.success) {
        console.error(`[orchestrator] Diff cycle failed: ${result.error ?? 'unknown'}`);
      } else {
        console.log(`[orchestrator] Diff cycle succeeded: ${result.mergedFiles.join(', ')}`);
      }
    },
  });
}
```

- [ ] **Step 4: Build CLI**

Run: `yarn workspace @awecode/cli build`
Expected: build success

- [ ] **Step 5: Smoke test**

Run: `node packages/cli/dist/index.js --help`
Expected: help text shows existing commands (no new subcommand added by Plan 6)

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands/chat.ts packages/cli/package.json
git commit -m "feat(cli): wire Orchestrator into chatCommand with AbortController"
```

---

## Task 11: Integration E2E test

**Files:**

- Create: `packages/orchestrator/tests/integration-lifecycle.test.ts`

- [ ] **Step 1: Write integration test**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import * as readline from 'node:readline/promises';
import { Orchestrator } from '../src/index.js';
import { ApprovalQueue, ContextManager } from '@awecode/agent';

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'awecode-orch-e2e-'));
  const git = simpleGit(tmpRoot);
  await git.init();
  await git.addConfig('user.email', 'test@test.com');
  await git.addConfig('user.name', 'Test');
  await writeFile(join(tmpRoot, '.gitattributes'), '* text=auto eol=lf\n');
  await writeFile(join(tmpRoot, 'package.json'), '{"name":"test","scripts":{"test":"vitest"}}\n');
  await writeFile(join(tmpRoot, 'foo.ts'), 'export const x = 1;\n');
  await git.add('.');
  await git.commit('initial');
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

vi.mock('node:readline/promises', () => ({
  default: { createInterface: vi.fn() },
}));

describe('Orchestrator E2E', () => {
  it('full cycle: parse → approve → worktree → apply → self-heal → merge → commit → cleanup', async () => {
    const rl = { question: vi.fn().mockResolvedValue('y\n'), close: vi.fn() };
    vi.mocked(readline.default.createInterface).mockReturnValue(rl as any);

    const phases: string[] = [];
    const chatMessages: any[] = [];

    const orch = new Orchestrator({
      projectRoot: tmpRoot,
      context: new ContextManager(),
      approvalQueue: new ApprovalQueue(),
      taskUuid: 'e2e-task-1',
      chatMessages,
      onPhaseChange: (p) => phases.push(p),
      runCommandOverride: async () => ({ exitCode: 0, stdout: 'pass', stderr: '' }),
    });

    const result = await orch.handleDiffDetected(
      `file_path: foo.ts
<<<< SEARCH
export const x = 1;
====
export const x = 2;
>>>> REPLACE`,
    );

    expect(result.success).toBe(true);
    expect(result.mergedFiles).toEqual(['foo.ts']);

    // Verify working dir updated
    const final = await readFile(join(tmpRoot, 'foo.ts'), 'utf-8');
    expect(final).toBe('export const x = 2;\n');

    // Verify commit
    const git = simpleGit(tmpRoot);
    const log = await git.log();
    expect(log.latest?.message).toContain('awecode: e2e-task-1');

    // Verify worktree cleaned up
    const branches = await git.branchLocal();
    expect(branches.all.filter((b) => b.startsWith('agent/'))).toHaveLength(0);

    // Verify phase sequence
    expect(phases[0]).toBe('parsing');
    expect(phases[phases.length - 1]).toBe('success');
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run packages/orchestrator/tests/integration-lifecycle.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/orchestrator/tests/integration-lifecycle.test.ts
git commit -m "test(orchestrator): E2E lifecycle (parse → approve → worktree → apply → heal → merge → commit)"
```

---

## Task 12: Workspace-wide validation + documentation

**Files:**

- Modify: `README.md`
- Create: `docs/orchestrator.md`
- Run: `yarn typecheck && yarn lint && yarn test && yarn build`

- [ ] **Step 1: Run all 4 gates**

Run: `yarn typecheck`
Run: `yarn lint`
Run: `yarn test`
Run: `yarn build`

Expected: all pass. Fix any unused-vars / type errors that surface.

- [ ] **Step 2: Update `README.md`**

In the Quick Start section, mention the orchestrator wires diff cycles automatically (no new commands added — the chat command now does the full cycle).

- [ ] **Step 3: Create `docs/orchestrator.md`**

```markdown
# Orchestrator

The orchestrator wires the chat loop to the harness, executing one **Diff Cycle**
per LLM diff response.

## Diff Cycle

1. **Parse** — extract Diff Blocks from assistant text
2. **Approve ALL** — user reviews each block (`y/n/e/s/a/q`) before any pipeline work
3. **Pipeline per block** (transactional):
   - Create Worktree (1 per cycle, reused across blocks)
   - Apply Diff → Self-heal Loop → Merge to Working Dir → Commit
4. **Cleanup** — remove Worktree

## HARNESS-1: diffFailStreak guard

When `applyDiff` fails, the self-heal loop increments `diffFailStreak`. At 3
failures (configurable), the loop aborts. Before abort, the orchestrator injects
a feedback message into the chat loop's `messages` array so the LLM regenerates
the diff in the next iteration.

## Undo

Each cycle produces 0..N commits prefixed `awecode: <taskUuid>`. Undo via:

\`\`\`bash
git log --oneline | grep "awecode: <taskUuid>"
git revert <sha>
\`\`\`

## Out of scope (v0.1)

- TUI rendering (Plan 5b)
- Full "push back to LLM with full file content" (v0.1 just passes error string)
- Ctrl+C signal-thread into `runCommand`
```

(Use literal triple backticks in the file — the `\`` escapes above are notation only.)

- [ ] **Step 4: Commit**

```bash
git add README.md docs/orchestrator.md
git commit -m "docs: orchestrator lifecycle + HARNESS-1 + undo guide"
```

---

## Self-Review

### Spec coverage

- Spec section "Architecture tổng quan" → Tasks 4-11
- Spec section "Orchestrator class" → Tasks 8, 9
- Spec section "TestCommandDetector" → Task 5
- Spec section "DiffInterceptor" → Task 6
- Spec section "ApprovalPrompter" → Task 7
- Spec section "HARNESS-1 fix" → Task 1
- Spec section "CLI wiring" → Task 10
- Spec section "Testing strategy" → covered in every TDD task + Task 11
- Spec section "Error handling" → Task 9 (return phase 'failed' with error)
- Spec section "Undo" → Task 12 (docs)
- Q1-Q10 grill decisions → captured in code (Q4 callback Task 1, Q5 commit Task 9, Q6 block transactionality Task 9 loop, Q7 message injection Task 9 callbacks, Q8 keep worktree on merge fail Task 9, Q9 approve-all-then-pipeline Task 8, Q10 git revert docs Task 12)

### Placeholder scan

- No "TBD", "TODO", "implement later"
- Every step contains complete code or exact commands
- All commit messages exact
- No "similar to Task N" — each task self-contained

### Type consistency

- `OrchestratorPhase` defined Task 8, used Tasks 8-11
- `OrchestratorOptions` defined Task 8, extended Task 9 (runCommandOverride, applyDiffOverride)
- `DiffCycleResult` defined Task 8, used Tasks 8-11
- `ParsedDiffBlock` defined Task 6, used Tasks 7-9
- `ApprovalDecision` extended Task 2, used Task 7-8
- `SelfHealCallbacks.onDiffApplyFailed` added Task 1, used Task 9
- `SelfHealEvent.diff_fail_streak_reached` added Task 1, used Task 1 test

### Known limitations (carry-forward)

- `runCommand` SIGKILL gate unreliable (Plan 4 inherited, not fixed here)
- Plan 5b TUI rendering — out of scope
- Full "file content push back to LLM" — v0.1 just passes error string (orchestrator injects simple message; richer prompt engineering deferred)
- Ctrl+C during `runCommand` exec — abortSignal checked between steps only
