# Plan 6 Design Spec: Chat ↔ Harness Orchestrator

**Status:** Draft (post-brainstorm, pre-implementation)
**Date:** 2026-06-20
**Author:** Awecode Contributors
**Depends on:** Plan 4 (Harness + Self-heal) — shipped at commit `07d9ac9`
**Blocks:** Plan 5b (TUI rendering của events emitted bởi Orchestrator)

## Mục tiêu

Lấp khoảng trống giữa `@awecode/agent` chat loop và `@awecode/harness` primitives: xây
dựng `@awecode/orchestrator` layer wiring chat→approval→worktree→self-heal→merge→commit.
Mỗi lần LLM emit diff là một **Diff Cycle** độc lập. Đồng thời hoàn tất HARNESS-1
(guard `diffFailStreak` còn thiếu từ Plan 4).

## Domain terms (grill Q1, Q3)

**Diff Cycle** (mới, thêm vào CONTEXT.md): Một iteration từ LLM emit diff →
approval → worktree → self-heal → merge → commit → cleanup. Một Task có nhiều
Diff Cycle. Mỗi cycle dùng 1 Worktree riêng (isolation per LLM response).

**Worktree** (cập nhật CONTEXT.md): lifecycle bounded bởi **Diff Cycle**, không
phải Task. "A Task owns one or more Worktrees" được hiểu là "qua nhiều cycle",
không đồng thời.

## Bối cảnh & Vấn đề

Plan 4 đã ship `@awecode/harness` với 5 modules (worktree, shell, selfheal, merge,
commit, sandbox) nhưng chỉ là **primitives** — chưa có gì gọi chúng. Plan 5a
(workflow engine) phụ thuộc Plan 4 cho "chat loop" (theo `awecode-v0.1-index.md`
dòng 32), nhưng không plan nào cover integration thực sự. Spec design-v2 dòng
236-241 mô tả self-heal chạy trong chat loop, không plan nào thực thi điều đó.

Hơn nữa, Plan 4 Self-Review claim "all 5 guards tested" nhưng review cho thấy
`diffFailStreak` được khai báo mà không được enforce (HARNESS-1 finding). Spec
dòng 311 định nghĩa semantics: "Diff apply fail 3 lần → đẩy lại LLM với full
file content".

## Thiết kế

### Kiến trúc tổng quan

Thêm package mới `@awecode/orchestrator` đóng vai trò glue layer:

```
┌─────────────────────────────────────────────────────────────────┐
│  CLI (packages/cli/src/commands/chat.ts)                        │
│    wires: runChatLoop + Orchestrator + AbortController          │
└──────┬──────────────────────────────────────────┬───────────────┘
       │ onDiffDetected(diffText)                 │ opts callbacks
       ▼                                          ▲
┌─────────────────────────┐                ┌──────┴────────────────┐
│  runChatLoop (agent)    │                │  Orchestrator          │
│  - KHÔNG sửa logic      │                │  (packages/orchestrator)│
│  - onDiffDetected fire  │                │                       │
└─────────────────────────┘                │  1. Parse diff         │
                                           │  2. Approval prompt    │
                                           │  3. createWorktree     │
                                           │  4. applyDiff          │
                                           │  5. runSelfHealLoop    │
                                           │  6. mergeToWorkingDir  │
                                           │  7. commitDiff         │
                                           │  8. removeWorktree     │
                                           └───┬───────────────────┘
                                               │
                                               ▼
                                    ┌──────────────────────┐
                                    │ @awecode/harness     │
                                    │ @awecode/diff        │
                                    │ @awecode/agent       │
                                    │   (ApprovalQueue)    │
                                    └──────────────────────┘
```

### Components

#### 1. `Orchestrator` class (`packages/orchestrator/src/orchestrator.ts`)

Class chính, giữ state cho 1 diff cycle.

```ts
export type OrchestratorPhase =
  | 'idle' | 'parsing' | 'approving' | 'creating_worktree'
  | 'applying_diff' | 'self_healing' | 'merging' | 'committing'
  | 'cleaning_up' | 'success' | 'failed' | 'aborted';

export interface OrchestratorOptions {
  projectRoot: string;
  context: ContextManager;
  approvalQueue: ApprovalQueue;
  selfHealConfig?: SelfHealConfig;
  commitStrategy?: CommitStrategy;
  taskUuid: string;
  abortSignal?: AbortSignal;
  /**
   * Reference đến messages array của runChatLoop. Khi `onDiffApplyFailed`
   * hoặc `onCommandFailed` cần LLM regenerate, Orchestrator push 1 fake
   * "user message" vào đây (Q7/A) → LLM regenerate tự nhiên trong iteration
   * kế tiếp của chat loop. Không gọi streamText trực tiếp.
   */
  chatMessages: ModelMessage[];
  onWorktreeCreated?: (wt: Worktree) => void;
  onSelfHealEvent?: (e: SelfHealEvent) => void;
  onApprovalRequest?: (req: ApprovalRequest) => void;
  onApprovalDecision?: (decision: ApprovalDecision) => void;
  onPhaseChange?: (phase: OrchestratorPhase) => void;
}

export interface DiffCycleResult {
  success: boolean;
  mergedFiles: string[];
  worktreeUuid?: string;
  error?: string;
}

export class Orchestrator {
  constructor(opts: OrchestratorOptions);
  handleDiffDetected(diffText: string): Promise<DiffCycleResult>;
  abort(): Promise<void>;
}
```

**Data flow cho 1 cycle `handleDiffDetected`:**

**Giai đoạn 1 — Parse + Approve ALL blocks** (Q9/B — không interrupt streaming,
approve happens after response xong):

1. **Phase `parsing`**: `DiffInterceptor.parse(diffText)` → `ParsedDiff[]`
2. **Phase `approving`** (lặp qua TẤT cả blocks trước khi pipeline chạy):
   - `ApprovalPrompter.prompt(block)` → decision cho từng block
   - `y` → đánh dấu block là approved
   - `n` → đánh dấu block là rejected (skip trong pipeline)
   - `e` → mở `$EDITOR`, user sửa block, re-approve → đánh dấu approved
   - `s` → skip ALL remaining blocks, exit giai đoạn 1
   - `a` → auto-approve tất cả blocks còn lại (flag)
   - `q` → abort toàn task, dừng ngay, không tạo worktree

**Giai đoạn 2 — Pipeline sequentially cho mỗi block đã approved** (Q6/A — mỗi
block là 1 transaction độc lập):

3. **Phase `creating_worktree`** (lần đầu; tái use cho block kế trong cycle)
4. **Phase `applying_diff`**: `applyDiff(block, wt.path)`
5. **Phase `self_healing`**:
   - `detectTestCommand(projectRoot)` (cached)
   - Nếu `null`: hỏi user qua `onApprovalRequest`; nếu vẫn `null`: skip self-heal,
     proceed thẳng merge (không test)
   - `runSelfHealLoop(wt, block, testCmd, config, callbacks, runCommand, abortSignal)`
     — khi apply fail trong loop, callback `onDiffApplyFailed` inject user message
     vào messages array của `runChatLoop` (Q7/A) → LLM regenerate trong iteration
     kế tiếp
   - Subscribe events → `onSelfHealEvent` callback (TUI render)
6. **Phase `merging`** (nếu self-heal pass hoặc bị skip vì không có test):
   `mergeToWorkingDir(projectRoot, wt, {mode:'git-merge'})` — merge code về
   working dir, không commit trong worktree (Q5/B)
7. **Phase `committing`**: `commitDiff(projectRoot, block, {strategy, taskUuid})`
   — commit trên working branch. **Block đã commit thì stay** (Q6/A) — nếu block
   kế fail, không rollback block đã commit.
8. Quay lại step 3 cho block kế tiếp đã approved

**Phase cuối:**
9. **Phase `cleaning_up`**: `removeWorktree(projectRoot, wt.uuid)` (nếu có)
10. **Phase `success` | `failed` | `aborted`**: return `DiffCycleResult`

**Quyết định từ brainstorm + grill batch 1:**
- Worktree tạo **per Diff Cycle** (Q1/A, Q3/A): mỗi LLM response (1 `onDiffDetected`)
  là 1 cycle độc lập, tạo 1 worktree riêng. Cycle = domain term mới trong CONTEXT.md.
- Test command **auto-detect** từ repo (không yêu cầu user config).
- Approval Mode **per-block, trước apply** (Q2/A): stronger than spec gốc yêu cầu
  ("approval before merge") — thoả mãn bằng cách approve trước khi apply.
- Self-heal pass → **auto merge + commit**; fail → show stderr + hỏi user.
- AbortSignal xuyên qua, SIGINT → `controller.abort()`.
- **Commit trên working dir, không commit trong worktree** (Q5/B): worktree chỉ là
  sandbox test. Khi self-heal pass → merge code về working dir qua `git-merge`
  → commit 1 lần trên working branch bằng `commitDiff`. Plan 4 `commitDiff`
  signature `(projectRoot, diff, options)` đã phù hợp.

#### 2. `TestCommandDetector` (`packages/orchestrator/src/test-detect.ts`)

```ts
export interface DetectedTestCommand {
  command: string;
  reason: string;
}

export async function detectTestCommand(
  projectRoot: string,
): Promise<DetectedTestCommand | null>;
```

Priority order (thắng đầu):

| Signal | Command | Notes |
|--------|---------|-------|
| `package.json` có `scripts.test` không rỗng, không phải `"echo no test"` | `yarn test` (nếu yarn.lock) / `npm test` | Node.js |
| `Cargo.toml` tồn tại | `cargo test` | Rust |
| `pytest.ini` hoặc `pyproject.toml` có `[tool.pytest]` | `pytest` | Python |
| `go.mod` tồn tại | `go test ./...` | Go |
| `Makefile` có target `test` | `make test` | Fallback |
| Không detect | `null` | Orchestrator hỏi user |

Caching: detect 1 lần mỗi task, Orchestrator cache kết quả.

#### 3. `DiffInterceptor` (`packages/orchestrator/src/diff-interceptor.ts`)

```ts
export interface ParsedDiffBlock {
  text: string;
  filePath: string;
  parsed: ParsedDiff;  // from @awecode/diff
}

export function parseAssistantDiff(text: string): ParsedDiffBlock[];
```

Parse assistant text chứa `<<<< SEARCH ... >>> REPLACE` blocks. Có thể chứa
nhiều block. Sử dụng `parseDiff` từ `@awecode/diff` đã có.

#### 4. `ApprovalPrompter` (`packages/orchestrator/src/approval.ts`)

Wrap `ApprovalQueue` từ `@awecode/agent`. Trả `Promise<ApprovalDecision>`.

```ts
export class ApprovalPrompter {
  constructor(approvalQueue: ApprovalQueue, opts?: { abortSignal?: AbortSignal });
  prompt(block: ParsedDiffBlock): Promise<ApprovalDecision>;
}
```

**Decision handling được thực hiện trong Orchestrator** (xem Section "Data flow").
Lưu ý: `ApprovalDecision` hiện tại là `'accept' | 'reject' | 'edit' | 'skip'` (4 giá trị).
Spec design-v2 dòng 32-33 yêu cầu 6 keystrokes `y/n/e/s/a/q`. Plan 6 sẽ **mở rộng
type** trong `packages/agent/src/approval.ts` thành:

```ts
export type ApprovalDecision =
  | 'accept'      // y — approve block, tiếp tục
  | 'reject'      // n — reject block, tiếp tục block kế
  | 'edit'        // e — mở $EDITOR, user sửa, re-approve
  | 'skip_all'    // s — skip ALL remaining, exit cycle
  | 'accept_all'  // a — auto-approve các block còn lại
  | 'quit';       // q — abort toàn task, dừng chat loop
```

Đây là minor breaking change trong `@awecode/agent` (thêm 2 union members). Các
consumer hiện tại (chỉ Plan 3 chat loop mock) không bị ảnh hưởng vì mock không
assert exhaustiveness.

TUI rendering chi tiết (render block diff, syntax highlight, keystroke handling)
thuộc Plan 5b. Plan 6 dùng `console.log` + `readline.question` tạm thời cho
CLI testing.

#### 5. HARNESS-1 fix (`packages/harness/src/{types,selfheal}.ts`)

**Types** — thêm event variant:
```ts
| { type: 'diff_fail_streak_reached'; count: number; lastError: string }
```

**Self-heal loop** — thêm counter + retry behavior + callback mới:

Thêm callback riêng cho apply failure (Q4/A — tách biệt rõ ràng với `onCommandFailed`
vốn nhận stderr từ `runCommand`):

```ts
export interface SelfHealCallbacks {
  onEvent: (e: SelfHealEvent) => void;
  onCommandFailed: (stderr: string, lastDiff: string) => Promise<string>;
  onDiffApplyFailed: (error: string, lastDiff: string) => Promise<string>;  // ← NEW
  applyDiff: (
    diff: string,
    worktreePath: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}
```

Logic loop:
```ts
let diffFailStreak = 0;  // init ở đầu loop

// Trong phần apply diff:
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

  // Retry: ask for new diff via onDiffApplyFailed (không phải onCommandFailed)
  currentDiff = await callbacks.onDiffApplyFailed(applyRes.error, currentDiff);
  continue;
}
callbacks.onEvent({ type: 'diff_applied', filePath: worktree.path });
diffFailStreak = 0;  // reset on success
```

**AbortSignal** — thêm optional param:
```ts
export async function runSelfHealLoop(
  worktree: Worktree,
  initialDiff: string,
  testCommand: string,
  config: SelfHealConfig,
  callbacks: SelfHealCallbacks,
  runCmd: RunCommandFn,
  abortSignal?: AbortSignal,  // ← NEW
): Promise<...>;
```

Backward compatible. Loop check `abortSignal?.aborted` giữa các step.

**OUT OF SCOPE HARNESS-1:** Tự đọc file content, "push back to LLM với full file
content" đầy đủ. Behavior đó do Orchestrator đọc file và inject user message
vào `chatMessages` (Q7/A) khi nhận `onDiffApplyFailed` — LLM regenerate tự
nhiên trong iteration kế tiếp của `runChatLoop`. HARNESS-1 chỉ thêm counter +
event + callback interface; chính Orchestrator mới quyết định regenerate
như thế nào.

### CLI wiring (`packages/cli/src/commands/chat.ts`)

```ts
import { Orchestrator } from '@awecode/orchestrator';
import { ApprovalQueue } from '@awecode/agent';
import { randomUUID } from 'node:crypto';
import type { ModelMessage } from 'ai';

// Trong chatCommand:
const controller = new AbortController();
process.on('SIGINT', () => controller.abort());

const messages: ModelMessage[] = [
  // ... initial messages từ chat loop setup
];

const orchestrator = new Orchestrator({
  projectRoot: process.cwd(),
  context,
  approvalQueue: new ApprovalQueue(),
  taskUuid: randomUUID(),
  abortSignal: controller.signal,
  chatMessages: messages,  // Q7/A: Orchestrator inject feedback messages vào đây
  onSelfHealEvent: (e) => console.log(`[self-heal] ${e.type}`),
  onPhaseChange: (p) => console.log(`[phase] ${p}`),
});

await runChatLoop(messages, {
  config,
  context,
  onToken,
  onDiffDetected: (text) => orchestrator.handleDiffDetected(text),
  abortSignal: controller.signal,
});
```

**Lưu ý quan trọng (Q7/A):** `runChatLoop` hiện tại nhận `initialMessages` và
build internal array. Để Orchestrator có thể inject feedback messages (khi
apply fail hoặc command fail), cần refactor nhẹ `runChatLoop` để nhận external
`messages` reference thay vì copy `initialMessages`. Đây là minor refactor trong
phạm vi Plan 6 — chi tiết implementation trong task plan.

### Testing strategy

| Layer | Strategy |
|-------|----------|
| `TestCommandDetector` | TDD với tmp dir fixtures (`package.json`/`Cargo.toml`/etc.) |
| `DiffInterceptor` | TDD với fixture text → `ParsedDiffBlock[]` |
| `ApprovalPrompter` | Mock `ApprovalQueue`, test 6 decisions |
| `Orchestrator` | Integration test: mocked `runCommand`, real `createWorktree` tmp dir, real git ops |
| HARNESS-1 (selfheal.ts) | Update existing test + 2 test mới (streak retry success, streak cap) |
| CLI wiring | Smoke test: build + inject fake diff text, verify orchestrator triggers |

### Error handling

| Tình huống | Phase cuối | Hành động |
|------------|-----------|-----------|
| Worktree tạo fail | `failed` | return error, không retry (lỗi hệ thống) |
| Apply fail (chưa đạt streak) | `self_healing` | retry trong self-heal loop qua `onDiffApplyFailed` callback → LLM regenerate (Q7/A) |
| Apply fail (đạt streak) | `failed` | giữ worktree cho user inspect, hỏi retry/discard/keep |
| Self-heal command fail (đạt maxSteps) | `failed` | giữ worktree, hỏi user |
| Merge conflict | `failed` | **giữ worktree, hỏi user** (Q8/B): (1) resolve manually qua `git mergetool` trong working dir, (2) discard cycle, (3) retry từ đầu. KHÔNG auto-remove worktree. |
| AbortSignal fire | `aborted` | `removeWorktree` (nếu có), return aborted |
| TestCommandDetector trả `null` | `approving` | hỏi user qua `ApprovalQueue`; vẫn `null` → skip self-heal, proceed merge + commit không test |
| Block N fail sau khi block 1..N-1 đã commit | `failed` | **giữ nguyên các commit đã xong** (Q6/A), hỏi user retry/skip/abort cycle, không rollback |

### Undo (Q10/A)

Mỗi Diff Cycle tạo 0 hoặc nhiều commit trên working branch với prefix
`awecode: <taskUuid>`. Để undo 1 cycle:

```bash
git log --oneline | grep "awecode: <taskUuid>"   # tìm commits của cycle
git revert <sha>                                   # undo 1 cycle cụ thể
```

Consistent với Q35 grill ("delegate `git revert`, không native"). Plan 6 không
thêm `awecode undo` command (scope creep) — user dùng `git revert` trực tiếp.
TUI (Plan 5b) có thể thêm helper prompt nhưng không phải native undo code.

### Decisions from grill batch 1

| # | Quyết định | Lý do |
|---|-----------|-------|
| Q1/A | Worktree lifecycle bounded bởi Diff Cycle, cập nhật CONTEXT.md | CONTEXT.md vốn mơ hồ (dòng 20-21 vs dòng 58); per-cycle isolation hợp lý hơn per-task |
| Q2/A | Approval per-block trước apply, auto-merge sau self-heal pass | Spec gốc không discriminate "trước apply" vs "trước merge" — Plan 6 mạnh hơn bằng cách approve trước apply |
| Q3/A | Thêm "Diff Cycle" vào CONTEXT.md như domain term | User-facing (TUI hiển thị "Cycle 2/5"); phân biệt rõ với "Self-heal Loop" |
| Q4/A | Callback mới `onDiffApplyFailed`, không tái use `onCommandFailed` | Tránh semantic overload; clear separation of concerns |
| Q5/B | Commit trên working dir, không commit trong worktree; 1 commit thay vì 2 | Plan 4 commitDiff signature đã phù hợp; avoid double-commit complexity; dễ rollback hơn |

### Decisions from grill batch 2

| # | Quyết định | Lý do |
|---|-----------|-------|
| Q6/A | Mỗi block trong cycle là 1 transaction độc lập. Block đã commit giữ nguyên khi block kế fail | Tôn trọng "user reviews each Diff Block sequentially" (CONTEXT.md); avoid `git revert` phức tạp |
| Q7/A | Orchestrator inject fake "user message" vào `messages` array để LLM regenerate | Giữ `runChatLoop` làm single LLM owner; tránh duplication LLM call logic; cần minor refactor `runChatLoop` nhận external messages ref |
| Q8/B | Merge conflict → giữ worktree, hỏi user resolve/discard/retry (KHÔNG auto-remove) | Conflict cần user quyết định; auto-remove mất code test pass; consistent với "hỏi user khi fail" pattern |
| Q9/B | Tách 2 giai đoạn: (1) approve ALL blocks sau streaming xong; (2) pipeline chạy sequentially | Spec gốc "approval happens after streaming" = không interrupt token stream; approve-all-then-pipeline đúng intent hơn approve-pipeline-approve-pipeline |
| Q10/A | Undo 1 cycle = `git revert <sha>`, consistent với Q35 grill | Q35 đã quyết định "delegate git revert, không native"; avoid scope creep thêm `awecode undo` command |

### Scope

**Trong scope Plan 6:**
- HARNESS-1 fix (counter + event + retry trong selfheal.ts)
- `@awecode/orchestrator` package với 4 modules (Orchestrator, TestDetector, DiffInterceptor, ApprovalPrompter)
- AbortSignal xuyên qua (selfheal + chat loop)
- CLI wiring trong `chatCommand`
- Console-based TUI rendering tạm thời
- Tests cho tất cả

**OUT OF scope Plan 6:**
- TUI rendering chi tiết (Plan 5b)
- "Full file content push back to LLM" đầy đủ: HARNESS-1 chỉ thêm callback interface `onDiffApplyFailed`; chính Orchestrator mới inject message để LLM regenerate (đã trong scope), nhưng việc **đọc file content và format prompt** cho LLM là logic phức tạp — v0.1 chỉ pass error string, defer full-content prompt về Plan 6+ hoặc Plan 5b
- Ctrl+C signal-thread vào `runCommand` (defer ra plan riêng nếu cần)
- Workflow engine (Plan 5a tách riêng)
- Repo Map integration
- Compaction

### File structure

```
packages/orchestrator/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── src/
│   ├── index.ts                # Public exports
│   ├── orchestrator.ts         # Orchestrator class + types
│   ├── test-detect.ts          # TestCommandDetector
│   ├── diff-interceptor.ts     # parseAssistantDiff
│   └── approval.ts             # ApprovalPrompter
└── tests/
    ├── orchestrator.test.ts    # Integration E2E
    ├── test-detect.test.ts
    ├── diff-interceptor.test.ts
    └── approval.test.ts
```

**Sửa file hiện có:**
- `packages/harness/src/types.ts` — thêm `diff_fail_streak_reached` event
- `packages/harness/src/selfheal.ts` — counter + retry + `onDiffApplyFailed` callback + abortSignal param
- `packages/harness/tests/selfheal.test.ts` — update existing test + 2 test mới (streak retry success, streak cap)
- `packages/harness/src/index.ts` — re-export type mới (nếu cần)
- `packages/agent/src/approval.ts` — mở rộng `ApprovalDecision` thêm `'skip_all' | 'accept_all' | 'quit'`
- `packages/agent/src/index.ts` — không sửa (type đã export)
- `packages/agent/src/chat.ts` — **minor refactor** (Q7/A): nhận external `messages` reference, không copy `initialMessages`
- `packages/cli/src/commands/chat.ts` — wiring Orchestrator + tạo messages array truyền cho cả 2
- `packages/cli/package.json` — add `@awecode/orchestrator` dep
- `tsconfig.json` (root) — add `packages/orchestrator` reference

### Dependencies

```
@awecode/orchestrator depends on:
  - @awecode/agent (ApprovalQueue, ContextManager)
  - @awecode/diff (parseDiff, applyDiff, ParsedDiff)
  - @awecode/harness (createWorktree, runSelfHealLoop, mergeToWorkingDir,
    commitDiff, removeWorktree, runCommand, SelfHealConfig, SelfHealEvent,
    Worktree, CommitStrategy)
```

### Tham chiếu

- Spec design-v2 dòng 220-241 (Direct Mode → Self-heal Loop hybrid control)
- Spec design-v2 dòng 308-311 (Self-heal config table, đặc biệt `diffFailStreak`)
- Spec design-v2 Q2 grill (hybrid control)
- Spec design-v2 Q22 grill (Ctrl+C — partial)
- Spec design-v2 Q29 grill (diff fail retry)
- ADR-0005 (`.awecode/` layout)
- ADR-0002 (workflow engine auto-trigger — Plan 5a tách riêng, không overlap)
- Plan 4 Self-Review (HARNESS-1 finding)
- Plan 4 progress ledger `.sdd/progress.md`
- Plan 4 Final whole-branch review (HARNESS-1 follow-up recommendation)
- Grill batch 1 (Q1-Q5) — decisions đã capture trong section "Decisions from grill"
- Grill batch 2 (Q6-Q10) — decisions đã capture trong section "Decisions from grill"
