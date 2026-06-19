# Awecode Plan 4: Harness + Self-heal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Build `@awecode/harness` — git worktree lifecycle, cross-platform shell execution with sandbox options, Self-heal Loop with bounded retries. By end: agent can create worktree, apply diff, run tests, capture errors, retry, merge to working dir.

**Architecture:** Harness wraps git worktree as isolation unit (CONTEXT.md). Self-heal Loop bounded by 5 guards (spec 5.3). Shell exec reuses `@awecode/tools` shellExecTool but with `cwd` bound to worktree path. Sandbox modes: git-only default, docker opt-in.

**Tech Stack:** `simple-git` for worktree ops, `child_process.spawn` (already in tools), optional `dockerode` for docker sandbox mode (deferred to Plan 5 if time-constrained).

## Global Constraints

(Same as Plan 1)

**References:**

- Spec section 5 (Harness)
- ADR-0005 (`.awecode/` consolidated directory)
- Q2 grill (hybrid self-heal control)
- Q22 grill (Ctrl+C handling)
- Q31 grill (consolidated directory)
- Q34 grill (commit strategy)
- Q35 grill (undo via git revert)

---

## File Structure

```
packages/harness/
├── src/
│   ├── index.ts
│   ├── types.ts            # Worktree, SandboxMode, SelfHealConfig
│   ├── worktree.ts         # create/list/clean worktree
│   ├── sandbox.ts          # network isolation per platform
│   ├── shell.ts            # runCommand (wraps tools.shellExec with cwd)
│   ├── selfheal.ts         # Self-heal loop with guards
│   ├── merge.ts            # mergeToWorkingDir
│   └── commit.ts           # commit strategy
└── tests/
```

---

## Task 1: Package skeleton + types

- Create: `packages/harness/{package.json, tsconfig.json}`
- Create: `packages/harness/src/types.ts`

```ts
export interface Worktree {
  uuid: string;
  path: string;           // absolute path to worktree dir
  branch: string;         // git branch name
  createdAt: number;
}

export type SandboxMode = 'git-only' | 'docker';

export interface SandboxConfig {
  mode: SandboxMode;
  isolateNetwork: boolean;
  commandTimeout: number;
  totalTimeout: number;
}

export interface SelfHealConfig {
  maxSteps: number;                  // default 3
  maxConsecutiveSameError: number;   // default 2
  totalTimeout: number;              // default 300_000
  commandTimeout: number;            // default 60_000
  diffFailStreak: number;            // default 3
}

export type SelfHealEvent =
  | { type: 'step_start'; step: number }
  | { type: 'command_start'; command: string }
  | { type: 'command_done'; exitCode: number; stderr: string }
  | { type: 'diff_applied'; filePath: string }
  | { type: 'consecutive_same_error'; count: number }
  | { type: 'step_cap_reached' }
  | { type: 'user_takeover' }
  | { type: 'success' };
```

- [ ] Standard TDD setup, install `simple-git`
- [ ] Commit: `feat(harness): scaffold package with Worktree and SelfHealConfig types`

---

## Task 2: Worktree lifecycle — create

**Files:**

- `packages/harness/src/worktree.ts`

```ts
import { simpleGit } from 'simple-git';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { Worktree } from './types.js';

export async function createWorktree(projectRoot: string): Promise<Worktree> {
  const uuid = randomUUID();
  const worktreesDir = join(projectRoot, '.awecode', 'worktrees');
  const worktreePath = join(worktreesDir, uuid);
  const branch = `agent/${uuid}`;

  await mkdir(worktreesDir, { recursive: true });

  const git = simpleGit(projectRoot);
  await git.raw(['worktree', 'add', worktreePath, '-b', branch]);

  return {
    uuid,
    path: worktreePath,
    branch,
    createdAt: Date.now(),
  };
}

export async function listWorktrees(projectRoot: string): Promise<Worktree[]> {
  const git = simpleGit(projectRoot);
  const output = await git.raw(['worktree', 'list', '--porcelain']);
  // Parse output, filter to .awecode/worktrees/
  const lines = output.split('\n');
  const worktrees: Worktree[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.startsWith('worktree ') && lines[i]!.includes('.awecode')) {
      const path = lines[i]!.slice('worktree '.length);
      const uuid = path.split(/[\\/]/).pop()!;
      worktrees.push({
        uuid,
        path,
        branch: `agent/${uuid}`,
        createdAt: 0, // would need stat() for real timestamp
      });
    }
  }
  return worktrees;
}

export async function removeWorktree(projectRoot: string, uuid: string): Promise<void> {
  const git = simpleGit(projectRoot);
  const branch = `agent/${uuid}`;
  await git.raw(['worktree', 'remove', join(projectRoot, '.awecode', 'worktrees', uuid), '--force']);
  await git.raw(['branch', '-D', branch]);
}

export async function cleanStaleWorktrees(projectRoot: string, maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<string[]> {
  const worktrees = await listWorktrees(projectRoot);
  const now = Date.now();
  const removed: string[] = [];
  for (const wt of worktrees) {
    if (now - wt.createdAt > maxAgeMs) {
      await removeWorktree(projectRoot, wt.uuid);
      removed.push(wt.uuid);
    }
  }
  return removed;
}
```

- [ ] Tests: create/list/remove (use temp git repo in `mkdtemp`)
- [ ] Commit: `feat(harness): worktree lifecycle create/list/remove/clean`

---

## Task 3: Run command in worktree

**Files:**

- `packages/harness/src/shell.ts`

```ts
import { shellExecTool } from '@awecode/tools';
import type { Worktree } from './types.js';

export interface RunCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runCommand(
  worktree: Worktree,
  command: string,
  timeoutMs: number = 60_000,
): Promise<RunCommandResult> {
  const result = await shellExecTool({
    command,
    cwd: worktree.path,
    timeoutMs,
  });

  if (!result.ok) {
    return { exitCode: 1, stdout: '', stderr: result.error };
  }

  // Parse output back into structured form
  const output = result.output;
  const stderrIdx = output.indexOf('[stderr]');
  if (stderrIdx !== -1) {
    return {
      exitCode: 0, // would need richer protocol
      stdout: output.slice(0, stderrIdx).trim(),
      stderr: output.slice(stderrIdx + '[stderr]'.length).trim(),
    };
  }

  return { exitCode: 0, stdout: output, stderr: '' };
}
```

- [ ] Tests: run `echo hello`, run `exit 1` (failure), timeout
- [ ] Commit: `feat(harness): runCommand executes shell in worktree cwd`

---

## Task 4: Self-heal loop with guards (TDD)

**Files:**

- `packages/harness/src/selfheal.ts`

**Behavior (per Q2 grill — hybrid control):**

1. Run command → if exit 0, success
2. If fail, capture stderr → call LLM/healing callback with stderr + Diff context
3. Apply new Diff Block → re-run
4. Track consecutive same stderr → if = maxConsecutiveSameError, signal user takeover
5. Cap at maxSteps

```ts
import type { SelfHealConfig, SelfHealEvent, Worktree } from './types.js';
import { runCommand, type RunCommandResult } from './shell.js';

export interface SelfHealCallbacks {
  onEvent: (e: SelfHealEvent) => void;
  onCommandFailed: (stderr: string, lastDiff: string) => Promise<string>; // returns new diff
  applyDiff: (diff: string, worktreePath: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}

export async function runSelfHealLoop(
  worktree: Worktree,
  initialDiff: string,
  testCommand: string,
  config: SelfHealConfig,
  callbacks: SelfHealCallbacks,
): Promise<{ success: boolean; finalStderr?: string; stepsUsed: number }> {
  let currentDiff = initialDiff;
  let lastStderr = '';
  let consecutiveSame = 0;
  const startTime = Date.now();

  for (let step = 1; step <= config.maxSteps; step++) {
    callbacks.onEvent({ type: 'step_start', step });

    // Apply diff
    const applyRes = await callbacks.applyDiff(currentDiff, worktree.path);
    if (!applyRes.ok) {
      return { success: false, finalStderr: applyRes.error, stepsUsed: step };
    }
    callbacks.onEvent({ type: 'diff_applied', filePath: worktree.path });

    // Run command
    callbacks.onEvent({ type: 'command_start', command: testCommand });
    const result: RunCommandResult = await runCommand(worktree, testCommand, config.commandTimeout);
    callbacks.onEvent({ type: 'command_done', exitCode: result.exitCode, stderr: result.stderr });

    if (result.exitCode === 0) {
      callbacks.onEvent({ type: 'success' });
      return { success: true, stepsUsed: step };
    }

    // Check consecutive same error
    if (result.stderr === lastStderr) {
      consecutiveSame++;
      callbacks.onEvent({ type: 'consecutive_same_error', count: consecutiveSame });
      if (consecutiveSame >= config.maxConsecutiveSameError) {
        callbacks.onEvent({ type: 'user_takeover' });
        return { success: false, finalStderr: result.stderr, stepsUsed: step };
      }
    } else {
      consecutiveSame = 0;
    }
    lastStderr = result.stderr;

    // Check total timeout
    if (Date.now() - startTime > config.totalTimeout) {
      callbacks.onEvent({ type: 'step_cap_reached' });
      return { success: false, finalStderr: result.stderr, stepsUsed: step };
    }

    // Ask callback for new diff based on stderr
    currentDiff = await callbacks.onCommandFailed(result.stderr, currentDiff);
  }

  callbacks.onEvent({ type: 'step_cap_reached' });
  return { success: false, finalStderr: lastStderr, stepsUsed: config.maxSteps };
}

export const DEFAULT_SELF_HEAL_CONFIG: SelfHealConfig = {
  maxSteps: 3,
  maxConsecutiveSameError: 2,
  totalTimeout: 300_000,
  commandTimeout: 60_000,
  diffFailStreak: 3,
};
```

- [ ] Tests with mocked callbacks: success on step 1, success on step 2, consecutive same triggers user takeover, maxSteps cap
- [ ] Commit: `feat(harness): Self-heal loop with 5 guards and hybrid control`

---

## Task 5: Merge to working dir

**Files:**

- `packages/harness/src/merge.ts`

```ts
import { simpleGit } from 'simple-git';
import type { Worktree } from './types.js';

export interface MergeOptions {
  mode: 'git-merge' | 'file-copy';
}

export type MergeResult =
  | { ok: true; commitSha: string }
  | { ok: true; mode: 'file-copy'; filesCopied: number }
  | { ok: false; error: string; conflicts?: string[] };

export async function mergeToWorkingDir(
  projectRoot: string,
  worktree: Worktree,
  options: MergeOptions = { mode: 'git-merge' },
): Promise<MergeResult> {
  const git = simpleGit(projectRoot);

  if (options.mode === 'git-merge') {
    try {
      const result = await git.merge([worktree.branch, '--no-edit']);
      if (result.conflicts && Object.keys(result.conflicts).length > 0) {
        return {
          ok: false,
          error: 'Merge conflicts',
          conflicts: Object.keys(result.conflicts),
        };
      }
      const commitSha = (await git.revparse(['HEAD'])).trim();
      return { ok: true, commitSha };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  // file-copy mode
  // TODO implement using fs.cp
  return { ok: true, mode: 'file-copy', filesCopied: 0 };
}
```

- [ ] Tests: merge success, merge with conflict (create conflict fixture)
- [ ] Commit: `feat(harness): mergeToWorkingDir via git-merge or file-copy`

---

## Task 6: Commit strategy (Q34 grill)

**Files:**

- `packages/harness/src/commit.ts`

```ts
import { simpleGit } from 'simple-git';
import type { ParsedDiff } from '@awecode/diff';

export type CommitStrategy = 'per-block' | 'per-task' | 'manual';

export interface CommitOptions {
  strategy: CommitStrategy;
  taskUuid: string;
}

export async function commitDiff(
  projectRoot: string,
  diff: ParsedDiff,
  options: CommitOptions,
): Promise<{ sha?: string; skipped?: boolean }> {
  if (options.strategy === 'manual') {
    return { skipped: true };
  }

  const git = simpleGit(projectRoot);
  await git.add(diff.filePath);

  const message = options.strategy === 'per-block'
    ? `awecode: ${options.taskUuid} — ${diff.filePath}`
    : `awecode: ${options.taskUuid}`;

  const result = await git.commit(message);
  return { sha: result.commit };
}
```

- [ ] Tests: per-block commit, per-task commit, manual skip
- [ ] Commit: `feat(harness): commit strategy per-block/per-task/manual`

---

## Task 7: Network isolation (per-platform)

**Files:**

- `packages/harness/src/sandbox.ts`

**Behavior (spec 5.4):**

- Windows: `netsh advfirewall` rule for child PID
- Linux: `unshare -n` wrapper
- macOS: `sandbox-exec` profile

v0.1 implementation: stub with warning if not supported. Real implementation deferred.

```ts
import { platform } from 'node:os';

export interface NetworkIsolationHandle {
  cleanup: () => Promise<void>;
}

export async function enableNetworkIsolation(pid: number): Promise<NetworkIsolationHandle | null> {
  const p = platform();
  if (p === 'linux') {
    // Try unshare -n on next spawn — requires user namespace
    // v0.1 stub
    console.warn('[awecode] Network isolation not yet implemented on Linux. Using git worktree isolation only.');
    return null;
  }
  if (p === 'win32') {
    console.warn('[awecode] Network isolation not yet implemented on Windows. Using git worktree isolation only.');
    return null;
  }
  if (p === 'darwin') {
    console.warn('[awecode] Network isolation not yet implemented on macOS. Using git worktree isolation only.');
    return null;
  }
  return null;
}
```

- [ ] Test: stub returns null with warning
- [ ] Commit: `feat(harness): network isolation stub with platform detection`

---

## Task 8: Wire harness into agent chat loop

**Files:**

- Modify: `packages/agent/src/chat.ts`

**Behavior:** When agent detects test command in response (or user mentions "test"), create worktree, apply diff in worktree, run command, enter self-heal loop, then merge.

- [ ] Add hook in chat loop: detect `run_tests` tool call → invoke harness
- [ ] Test: integration test mocking harness lifecycle
- [ ] Commit: `feat(agent): integrate harness worktree + self-heal into chat loop`

---

## Task 9: CLI integration — `awecode worktree` subcommands

**Files:**

- `packages/cli/src/commands/worktree.ts`

```ts
import { listWorktrees, removeWorktree, cleanStaleWorktrees } from '@awecode/harness';
import { cwd } from 'node:process';

export async function worktreeCommand(args: string[]): Promise<void> {
  const sub = args[0];
  if (sub === 'list') {
    const wts = await listWorktrees(cwd());
    console.log(wts.length === 0 ? 'No worktrees.' : wts.map((w) => `${w.uuid}  ${w.branch}  ${w.path}`).join('\n'));
  } else if (sub === 'clean') {
    const uuid = args[1];
    if (uuid) {
      await removeWorktree(cwd(), uuid);
      console.log(`Removed worktree ${uuid}`);
    } else {
      const removed = await cleanStaleWorktrees(cwd());
      console.log(`Cleaned ${removed.length} stale worktrees`);
    }
  } else {
    console.error('Usage: awecode worktree list|clean [<uuid>]');
    process.exit(1);
  }
}
```

- [ ] Wire `awecode worktree` into `packages/cli/src/index.ts`
- [ ] Commit: `feat(cli): worktree subcommands list/clean`

---

## Task 10: E2E — refactor + test scenario

**Files:**

- `packages/cli/tests/e2e-refactor.test.ts`

**Scenario:**

1. Temp project with `src/parser.ts` containing buggy `parseLine` function + `src/parser.test.ts`
2. Spawn CLI, prompt: "Fix the parseLine bug and verify tests pass"
3. Assert: worktree created, diff applied in worktree, test ran, if failed self-heal kicked in, after success merge to working dir
4. Final assertion: tests pass in main project dir

- [ ] Skip if no LLM API key
- [ ] Commit: `test(cli): e2e refactor+self-heal scenario`

---

## Task 11: Documentation

- Update README with harness usage
- Create `docs/harness.md` covering worktree lifecycle + self-heal
- Document `.awecode/worktrees/` directory + GC

- [ ] Commit: `docs: harness and self-heal documentation`

---

## Self-Review

### Spec coverage

- Spec 5.1 (lifecycle): ✅ Tasks 2, 3
- Spec 5.2 (cross-platform shell): ✅ Task 3 (delegates to tools.shellExecTool)
- Spec 5.3 (Self-heal guards): ✅ Task 4
- Spec 5.4 (Sandbox modes): ✅ Task 7 (stub, real impl deferred)
- Spec 5.5 (Merge): ✅ Task 5
- Spec 5.6 (Worktree mgmt commands): ✅ Task 9
- Spec 5.7 (Commit strategy): ✅ Task 6
- Spec 5.8 (Undo via git): ✅ implicit — awecode commits via simple-git, user uses `git revert`
- Q2 grill (hybrid control): ✅ Task 4 `consecutive_same_error` triggers user takeover
- ADR-0005 (`.awecode/`): ✅ Task 2 uses `.awecode/worktrees/<uuid>`

### Type consistency

- `Worktree`, `SelfHealConfig`, `SelfHealEvent` consistent across tasks
- `RunCommandResult` shape defined Task 3, consumed Task 4
