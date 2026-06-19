# Awecode — CLI Coding Agent (Design Spec v2)

**Ngày:** 2026-06-19
**Trạng thái:** Approved (post-grill — see [Grill Session Notes](#11-grill-session-notes))
**Scope:** v0.1 — MVP with Workflow Engine + Harness + Self-heal

> **Changelog from v1:** Refactored terminology (see [CONTEXT.md](../../../CONTEXT.md)), added Workflow Engine (the core USP), added Skill system, anchor-based diff positioning, Vercel AI SDK, test strategy, first-run wizard, 14-16 week timeline. v1 archived at `docs/superpowers/specs/archive/2026-06-19-awecode-design-v1-pre-grill.md`.

---

## 1. Mục tiêu

Xây dựng CLI Coding Agent bằng TypeScript, lấy **cảm hứng** (không fork code) từ:

- **Aider** — search/replace Diff Block với anchor-based positioning
- **Plandex** — Worktree cô lập + Self-heal Loop
- **OpenCode** — tool calling schema
- **Cline** — explicit Context Entry tracking + UI panel
- **SWE-agent** — Agent-Computer Interface guards tránh infinite loop
- **Superpowers / grill-with-docs-v2** — built-in Skill system, workflow pipeline

**Ambition:** Học sâu → personal tool → open-source MVP → commercial path.

**USP chính:** Built-in **Workflow Engine** auto-detect intent → run brainstorm→spec→grill→plan pipeline khi task phức tạp. Đây là điểm khác biệt với Aider/Cline/OpenCode (chat loop thuần).

**Success criterion v0.1:** End-to-end creative task trên repo Windows (vd "refactor function + add test") → auto chạy pipeline → diff apply → self-heal loop → approval → merge. Không crash, không corrupt file.

---

## 2. Non-Goals (v0.1)

- Plan-approve workflow ở agent decision level (chỉ có meta-workflow user-facing)
- Plugin marketplace (skills có sẵn + user add manually, chưa có install command)
- Web UI (chỉ TUI)
- Docker sandbox mặc định (opt-in config)
- MCP server hosting (chỉ MCP client cho external tools)
- Cascade model fallback / rule-based routing (chỉ manual `--model`)
- Vector search / embeddings (Repo Map chỉ dùng tree-sitter outline)

---

## 3. Architecture Tổng thể

### 3.1 Sơ đồ

```
┌─────────────────────────────────────────────────────────────┐
│                    CLI Entry (Ink TUI)                       │
│        packages/cli — React components, input, view          │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                       Agent Core                             │
│  packages/agent — chat loop, tool dispatcher, intent detect, │
│  Context Manager, Approval gate                              │
└─────┬──────────────┬───────────────┬────────────┬───────────┘
      │              │               │            │
      ▼              ▼               ▼            ▼
┌──────────┐  ┌────────────┐  ┌──────────┐  ┌──────────────┐
│ Diff     │  │ Harness    │  │ Tools    │  │ Workflow     │
│ Engine   │  │ (git wt)   │  │          │  │ Engine       │
│          │  │            │  │ file ops │  │              │
│ search/  │  │ worktree,  │  │ shell    │  │ skill loader │
│ replace, │  │ run cmd,   │  │ grep     │  │ invoke_skill │
│ fuzzy    │  │ self-heal  │  │ glob     │  │ slash cmds   │
│ match    │  │            │  │ MCP ext  │  │              │
└──────────┘  └────────────┘  └──────────┘  └──────┬───────┘
      │              │               │            │
      │              │               │            ▼
      │              │               │   ┌────────────────┐
      │              │               │   │ Built-in Skills│
      │              │               │   │ (SKILL.md)     │
      │              │               │   │ brainstorm     │
      │              │               │   │ spec           │
      │              │               │   │ grill          │
      │              │               │   │ plan           │
      │              │               │   └────────────────┘
      │              │               │
      └──────────────┴─────┬─────────┘
                           ▼
              ┌──────────────────────────┐
              │ Vercel AI SDK (`ai`)     │
              │ - @ai-sdk/anthropic      │
              │ - @ai-sdk/openai         │
              │ - @ai-sdk/google         │
              │ - ollama-ai-provider     │
              │ - createOpenAI(baseURL)  │
              │   for OpenAI-compatible  │
              └──────────────────────────┘
```

### 3.2 Packages và trách nhiệm

| Package | Trách nhiệm | Phụ thuộc |
|---------|-------------|-----------|
| `cli` | TUI Ink, user input, render diff/context/approval, slash command dispatch | `agent`, `workflow` |
| `agent` | Chat loop, tool dispatcher, Context Manager, Intent Declaration detection, Approval gate | `diff`, `harness`, `tools`, `workflow`, `llm` |
| `diff` | Parse search/replace format với anchor positioning, fuzzy match via `diff-match-patch`, apply to file | (none, pure) |
| `harness` | Git worktree lifecycle (UUID + GC), run shell command cross-platform, capture stderr, Self-heal Loop guards | `tools` (cho shell exec) |
| `tools` | Tool implementations: file ops, shell (with platform normalize), grep, glob, MCP client (for external servers) | (none, leaf) |
| `workflow` | Skill loader (SKILL.md), `invoke_skill()` tool, slash command dispatcher, session state persistence | (none) |
| `llm` (sub-package) | Vercel AI SDK wrapper, provider config, first-run wizard | (none) |

**Nguyên tắc:**

- `diff`, `tools`, `workflow`, `llm` là pure leaf — test đơn giản, không phụ thuộc IO
- `agent` chỉ orchestrate — không chứa logic diff/shell/git trực tiếp
- `cli` chỉ render — không chứa business logic
- Mỗi package export typed API, test độc lập
- LLM calls luôn qua Vercel AI SDK, không bao giờ gọi provider SDK trực tiếp (xem [ADR-0001](../../adr/0001-vercel-ai-sdk-for-llm-abstraction.md))

---

## 4. Diff Engine (`packages/diff`)

Module quan trọng nhất — quyết định agent sửa file có chính xác không.

### 4.1 Format LLM trả về

```
file_path: src/utils/parser.ts
at: @after: function parseLine
```
<<<< SEARCH
export function parseDiff(input: string): Diff {
  const lines = input.split('\n');
  return parseOld(lines);
}
====
export function parseDiff(input: string): Diff {
  const lines = input.split('\n');
  return parseNew(lines);
}
>>>> REPLACE
```

**Quy ước:**

- `file_path:` header — xác định target file
- `at:` header (tùy chọn) — chỉ định vị trí insert qua anchor:
  - `@after: <symbol>` — insert ngay sau symbol (function/class/method)
  - `@before: <symbol>` — insert ngay trước symbol
  - Mặc định (không `at:`): insert tại cuối file
- Nhiều block SEARCH/REPLACE trong 1 file → áp dụng tuần tự từ trên xuống
- Block SEARCH rỗng + REPLACE có nội dung → **insert** tại vị trí `at` (hoặc cuối file)
- **Delete file:** không dùng diff rỗng — agent phải gọi tool `delete_file: <path>` riêng
- Có thể có nhiều `file_path` section trong 1 LLM response

Anchor grammar được spec rõ trong system prompt để tránh malformed anchors (xem [ADR-0003](../../adr/0003-anchor-based-diff-insert-positioning.md)).

### 4.2 Fuzzy Matching Algorithm

Dùng **`diff-match-patch`** (Google's library, port JS thuần):

1. **Normalize whitespace** trước khi so khớp — bỏ qua khác biệt tab/space, trailing whitespace
2. **Tìm vị trí tốt nhất:**
   - Nếu SEARCH khớp exact substring → dùng ngay
   - Nếu không → `diff-match-patch.match_main(text, search, 0)` tìm substring có độ tương đồng cao nhất
   - Threshold similarity ≥ 0.85 (config được) → chấp nhận
3. **Apply** thay thế tại vị trí đã normalize, giữ indentation gốc khi có thể

### 4.3 API

```ts
export interface DiffBlock {
  search: string;
  replace: string;
  anchor?: { type: 'after' | 'before'; symbol: string };
}

export interface ParsedDiff {
  filePath: string;
  blocks: DiffBlock[];
}

export function parseDiff(llmOutput: string): ParsedDiff[];

export function applyDiff(source: string, blocks: DiffBlock[]): ApplyResult;

export type ApplyResult =
  | { ok: true; result: string }
  | { ok: false; error: 'no_match'; block: DiffBlock; bestScore: number; suggestions: Array<{ line: number; preview: string }> }
  | { ok: false; error: 'ambiguous'; matches: Array<{ line: number; preview: string }> }
  | { ok: false; error: 'anchor_not_found'; anchor: DiffBlock['anchor']; suggestions: string[] };
```

**Suggestion payload** (xem Q4 grill): khi fail, engine return 3 vị trí gần nhất với preview. Agent đối chiếu và viết lại SEARCH.

### 4.4 Structured Output từ LLM

LLM không tự do trả JSON — dùng **Vercel AI SDK `generateObject({ schema })`** hoặc native tool_use để ép JSON valid (xem Q16 grill, [ADR-0001](../../adr/0001-vercel-ai-sdk-for-llm-abstraction.md)):

```ts
const result = await generateObject({
  model: llm.getModel(),
  schema: diffResponseSchema,  // Zod schema
  prompt: ...,
});
// result.object đã typed-safe, không cần parse thủ công
```

### 4.5 Edge cases

- SEARCH không khớp → `no_match` với suggestions
- SEARCH khớp nhiều vị trí → `ambiguous` với tất cả matches
- Anchor không tìm thấy symbol → `anchor_not_found` với symbol suggestions
- File không tồn tại → caller (agent) quyết định: tạo file mới
- File binary hoặc quá lớn (>100KB) → error, agent không apply

---

## 5. Harness Workspace (`packages/harness`)

Cross-platform (Windows/Linux/Mac), dùng **native git worktree**.

### 5.1 Lifecycle

```
1. Task declared (vd "refactor parser + add tests")
   ↓
2. harness.createWorktree()
   - Generate random UUID
   - git worktree add .agent-ws/<uuid> -b agent/<uuid>
   - .agent-ws/ auto-added to .gitignore
   - Returns path: <projectRoot>/.agent-ws/<uuid>
   ↓
3. Agent apply Diff Blocks vào worktree (KHÔNG vào working dir)
   ↓
4. Agent gọi harness.runCommand('yarn test')
   - cwd = worktree path
   - Capture stdout, stderr, exitCode
   - Timeout mặc định 60s
   ↓
5. Test pass?
   - yes → Approval Mode → user y/n/e/a/q → merge hoặc discard
   - no  → Self-heal Loop (hybrid control):
          - Agent auto-retry, đọc stderr, sinh Diff Block mới
          - Re-run command
          - Cap tại maxSteps=3
          - On maxConsecutiveSameError=2 → user takes over
          ↓
6. Step cap reached → notify user, show final stderr,
   hỏi giữ worktree hay discard
```

**Worktree GC:** Trên CLI exit, worktree giữ lại 24h (config) cho resume. Sau đó garbage-collected. `awecode worktree clean` để dọn thủ công.

### 5.2 Cross-platform Shell Execution

**Vấn đề:** LLM có thể sinh `rm file.js` (bash) thay vì `Remove-Item file.js` (PowerShell).

**Giải pháp 2 lớp:**

**Lớp 1 — Tool interface có command normalization:**

```ts
export interface ShellCommand {
  cmd: 'rm' | 'mkdir' | 'cp' | 'mv' | 'cat' | 'echo' | 'custom';
  args: string[];
}

function normalizeForPlatform(cmd: ShellCommand): string[] {
  if (process.platform === 'win32') {
    return mapToPowerShell(cmd);
  }
  return mapToBash(cmd);
}
```

**Lớp 2 — Nếu LLM sinh raw shell string:**

- Tool `shell_exec` luôn chạy qua `child_process.spawn` với shell detect
- Windows: `powershell.exe -Command <cmd>` (mặc định), hoặc `cmd.exe /c` nếu user config
- Linux/Mac: `/bin/bash -c <cmd>` (mặc định), hoặc zsh nếu config
- **Không parse/censor LLM shell** — agent đang trong worktree cô lập, rollback được qua `git checkout`

### 5.3 Self-heal Loop Guards

| Guard | Mặc định | Lý do |
|-------|----------|-------|
| `maxSteps` | 3 | Hết bước → user takes over |
| `maxConsecutiveSameError` | 2 | Cùng stderr 2 lần liên → agent stuck, user quyết |
| `totalTimeout` | 5 phút | Cả loop không quá 5 phút |
| `commandTimeout` | 60s | 1 lệnh test không quá 60s |
| `diffFailStreak` | 3 | Diff apply fail 3 lần → đẩy lại LLM với full file content |

### 5.4 Sandbox Modes

User chọn qua config `.agentrc.yaml`:

| Mode | Cài đặt | Bảo vệ |
|------|---------|--------|
| `git-only` (default) | Git worktree trong project | Lỗi → rollback bằng `git checkout` |
| `docker` (opt-in) | Worktree trong container Docker | Cô lập hoàn toàn |
| `isolateNetwork: true` (default ON) | Block outgoing HTTP | Ngừa LLM gọi API lấy token |

**Network isolation theo mode:**

- `docker`: `--network=none`
- `git-only` Windows: Windows Firewall rule tạm cho PID (user-scope, không cần admin)
- `git-only` Linux: `unshare -n` hoặc `firejail --net=none`
- `git-only` macOS: `sandbox-exec` với profile deny network
- Platform không support → log warning, tiếp tục (chỉ mất network block)

### 5.5 Merge về working dir

```ts
async function mergeToWorkingDir(
  worktreePath: string,
  options: { mode: 'git-merge' | 'file-copy' }
): Promise<MergeResult>
```

- **`git-merge` (default):** `git merge agent/<uuid>` vào branch hiện tại. Conflict → TUI report.
- **`file-copy`:** Sao chép bytes thẳng (khi user không muốn branch).

### 5.6 Worktree Management Commands

Cả CLI subcommand và slash command (xem Q17 grill):

```bash
# CLI subcommand (scriptable)
awecode worktree list
awecode worktree show <uuid>
awecode worktree clean [<uuid>]
awecode worktree clean --stale   # cleanup worktrees > 24h old

# Slash command trong TUI
/worktree list
/worktree clean <uuid>
```

---

## 6. Context Manager (`packages/agent/context.ts`)

USP "Context Transparency" — user thấy chính xác cái gì trong context.

### 6.1 Context Entry Structure

```ts
interface ContextEntry {
  id: string;
  type: 'file' | 'snippet' | 'symbol' | 'command-output' | 'diff' | 'repo-map';
  path?: string;
  lines?: { start: number; end: number };
  tokens: number;
  addedAt: number;
  addedBy: 'user' | 'agent';
}

interface Context {
  entries: ContextEntry[];
  totalTokens: number;
  budget: number;
}
```

### 6.2 Operations

| Operation | Mô tả |
|-----------|-------|
| `addFile(path, lines?)` | Đọc file (hoặc partial), estimate tokens, thêm entry |
| `addRepoMap()` | Tree-sitter parse cả repo → outline ngắn |
| `removeEntry(id)` | User xóa entry qua TUI |
| `summarize()` | Khi gần full budget: LLM tóm tắt entry cũ nhất |
| `refreshFile(path)` | Re-read content mới khi file modify |
| `toPrompt()` | Serialize entries thành messages |
| `snapshot()` | Trạng thái cho TUI render |

### 6.3 Token Estimation

Dùng `gpt-tokenizer` (JS pure, xấp xỉ tốt cho OpenAI/Anthropic).

### 6.4 Pattern picked từ OSS research

| Pattern | Lấy từ |
|---------|--------|
| Repo Map via tree-sitter | Aider |
| Explicit token tracking + UI panel | Cline |
| File content auto-refresh mỗi turn | Plandex |
| Auto-summarize khi gần full | Cline condense |
| Partial-file (lines range) | USP riêng |

### 6.5 Auto-management rules

| Trigger | Action |
|---------|--------|
| `totalTokens > 0.85 * budget` | Hỏi user: summarize hoặc remove |
| File modify qua diff | Tự `refreshFile` |
| Agent gọi `read_file` | Tự thêm vào context |
| Diff apply fail 3 lần | Auto re-add file full content |

### 6.6 Repo Map (v0.1)

**Ship v0.1 với 5 ngôn ngữ:** TypeScript, JavaScript, Python, Go, Rust (xem Q19 grill — user chọn full coverage, timeline kéo 14-16 tuần).

Tree-sitter parsers: `web-tree-sitter` + grammar packages.

### 6.7 Context Transparency TUI

```
┌─ Context (12,341 / 100,000 tokens) ─────────────────┐
│ ▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
├──────────────────────────────────────────────────────┤
│ [user]   src/utils/parser.ts       (full)    234 tok │
│ [user]   src/utils/parser.test.ts  (full)    156 tok │
│ [agent]  cmd: yarn test            (stderr)  421 tok │
│ [agent]  diff: parser.ts           (patch)    89 tok │
│ [agent]  repo-map                  (outline) 612 tok │
├──────────────────────────────────────────────────────┤
│ [x] remove  [e] expand  [s] summarize old           │
└──────────────────────────────────────────────────────┘
```

---

## 7. Workflow Engine (`packages/workflow`)

**Đây là USP chính của awecode** — khác biệt với Aider/Cline/OpenCode.

### 7.1 Intent Declaration

Khi user gửi prompt, agent **tự quyết định** có chạy Workflow hay không bằng cách emit `start_workflow(name)` tool call ở đầu response (xem [ADR-0002](../../adr/0002-workflow-engine-auto-trigger-by-intent.md)):

| Loại task | Agent behavior |
|-----------|----------------|
| "Fix typo 'recieve' → 'receive' trong X" | Không emit workflow → chat loop như Aider |
| "Add unit test for `parseDiff`" | Có thể emit `start_workflow("spec")` nhẹ |
| "Build CSV import feature with validation" | Emit `start_workflow("brainstorm")` → full pipeline |
| "Refactor toàn bộ auth module sang OAuth" | Emit `start_workflow("brainstorm")` → full pipeline |

User có thể override:

- `/brainstorm`, `/spec`, `/grill`, `/plan` — slash command explicit
- `/skip-workflow` — ép agent vào chat loop

### 7.2 Built-in Workflows

4 phase pipelines, mỗi phase là 1 Skill:

```
brainstorm → spec → grill → plan → [agent implementation]
```

| Skill | Mục đích | Output |
|-------|----------|--------|
| `brainstorm` | Khám phá requirements, đề xuất approaches | Design decisions |
| `spec` | Viết design doc | `docs/specs/<topic>-design.md` |
| `grill` | Stress-test spec bằng batched questions | Spec revisions + ADRs |
| `plan` | Tạo implementation plan | `docs/plans/<topic>-plan.md` |

### 7.3 Skill Format

**SKILL.md thuần** — compatible với superpowers/grill-with-docs-v2 (xem Q7 grill):

```markdown
---
name: brainstorm
description: "Explore user intent before implementation."
trigger: creative-task
---

# Brainstorming

Read project context first. Ask one question at a time...
```

### 7.4 Skill Layout & Precedence

(xem Q8 grill)

| Location | Purpose |
|----------|---------|
| `awecode/skills/` (built-in) | 4 skill cốt lõi, ship với binary |
| `~/.config/awecode/skills/` | User-global skills |
| `.awecode/skills/` (project) | Project-specific skills, commit vào git |

**Precedence:** project > user > built-in. User có thể override built-in bằng cách đặt skill cùng tên ở mức cao hơn.

### 7.5 Skill Composition

Skill có thể gọi skill khác qua tool `invoke_skill(name)` (xem Q9 grill):

```ts
// Trong skill "brainstorm", agent có thể gọi:
await invoke_skill('grill-with-docs-v2', { spec: '...' });
```

### 7.6 Session State

Lưu ở `.awecode/session.json` trong project root (xem Q10 grill):

```json
{
  "taskId": "<uuid>",
  "currentWorkflow": "grill",
  "currentPhase": "round-3",
  "history": [
    { "workflow": "brainstorm", "completedAt": "...", "output": "..." },
    { "workflow": "spec", "completedAt": "...", "output": "..." }
  ],
  "pendingQuestions": [...]
}
```

Resumable across TUI sessions. Commit-able cho team collaboration.

---

## 8. TUI + Approval Flow (`packages/cli`)

### 8.1 Layout Ink (3 panel)

```
┌─ Context (12k/100k) ──┬─ Conversation ──────────────────────┐
│ ▓▓▓░░░░░░░░░░░░░░░░   │ User: refactor parseDiff + add test │
│                       │                                      │
│ [user] parser.ts      │ ⚡ Agent invoked workflow: brainstorm│
│        234 tok  [x]   │                                      │
│ [user] parser.test    │ Agent: Let me explore your intent... │
│        156 tok  [x]   │                                      │
│ [agent] yarn test     │ [workflow: brainstorm, round 2/5]   │
│        421 tok  [x]   │                                      │
│ [agent] diff (patch)  │                                      │
│         89 tok  [x]   │                                      │
│ [r] refresh  [s] sum  │                                      │
├───────────────────────┴──────────────────────────────────────┤
│ > _                                                          │
└──────────────────────────────────────────────────────────────┘
```

### 8.2 Approval Flow — Non-blocking (Q5 grill)

Agent **stream response đầy đủ** trước, rồi mới vào Approval Mode. Diff Blocks queue trong quá trình stream, xử lý tuần tự sau:

```
┌─ Diff Approval (2 blocks in parser.ts) ───────────────────┐
│                                                            │
│ Block 1/2 — replace lines 12-18                            │
│ ─────────────────────────────────────                      │
│  -export function parseDiff(input: string): Diff {         │
│  -  return parseOld(input.split('\n'));                    │
│  -}                                                        │
│  +export function parseDiff(input: string): Diff {         │
│  +  const lines = input.split('\n');                       │
│  +  return parseNew(lines);                                │
│  +}                                                        │
│                                                            │
│ [y] accept  [n] reject  [e] edit  [s] skip  [?] help       │
└────────────────────────────────────────────────────────────┘
```

| Phím | Hành động |
|------|-----------|
| `y` | Accept block, apply vào worktree |
| `n` | Reject block, agent biết block bị reject |
| `e` | Mở editor edit diff bằng tay |
| `s` | Skip block, tiếp |
| `a` | Accept tất cả còn lại |
| `q` | Quit approval, discard tất cả |
| `?` | Help |

### 8.3 Editor Detection (Q12 grill)

Phím `e` mở editor theo thứ tự detect:

1. `$EDITOR` env (nếu set)
2. `$VISUAL` env (nếu set)
3. `code --wait` (VS Code, nếu có trong PATH)
4. `notepad` (Windows) / `nano` (Linux/Mac)

Mở file tạm chứa diff text. Đợi editor close → re-read → dùng làm Diff Block mới.

### 8.4 Session State Machine

```
                user input
   Idle ──────────────────► Thinking (stream)
     ▲                          │
     │                          ▼
     │                    [emit start_workflow?]
     │                          │
     │              ┌───────────┴────────────┐
     │              ▼                        ▼
     │        Workflow Active         Tool Call Running
     │        (skill phases)                │
     │              │                        ▼
     │              ▼                  Tool Done
     │        Workflow Done                  │
     │              │                  diff produced?
     │ no diff      │                       │ yes
     └──────────────┘                       ▼
                                        Approval Mode
                                          (queue + review at end of turn)
```

---

## 9. LLM Provider Strategy (Q20 grill, ADR-0001)

### 9.1 Stack

Dùng **Vercel AI SDK** làm abstraction:

```ts
import { generateText, streamText, generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai, createOpenAI } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { ollama } from 'ollama-ai-provider';
```

### 9.2 Provider Config

4 loại provider user chọn:

| Loại | Khi nào dùng | Config cần |
|------|--------------|------------|
| OpenAI chính thức | Dùng GPT models | `apiKey` |
| OpenAI-compatible | OpenRouter, Together, Groq, DeepSeek, vLLM, LM Studio | `baseURL` + `apiKey` + `model` |
| Anthropic native | Claude models (tool_use native format) | `apiKey` |
| Google Gemini | Gemini models | `apiKey` |
| Ollama local | Local models (Llama, Qwen, Mistral) | `baseURL` (mặc định `http://localhost:11434`) |

### 9.3 First-run Wizard

Lần đầu chạy `awecode`, nếu chưa có config:

```
$ awecode
Welcome to awecode! Let's set up your LLM provider.

? Choose provider:
  ❯ OpenAI (GPT models)
    Anthropic (Claude models)
    Google (Gemini models)
    Ollama (local models)
    OpenAI-compatible (OpenRouter, Together, etc.)

? API key: ********
? Default model [gpt-4o-mini]: 

✓ Config saved to ~/.config/awecode/config.yaml
```

### 9.4 Config Precedence

`CLI flags > env vars > project .agentrc.yaml > user ~/.config/awecode/config.yaml > defaults`

---

## 10. Quy chuẩn Kỹ thuật

### 10.1 Stack

| Thành phần | Lựa chọn |
|------------|----------|
| Ngôn ngữ | TypeScript strict mode |
| Runtime | Node.js 20 LTS |
| Package manager | `yarn` berry v4 |
| TUI | `ink` v5 + `react` v18 |
| Monorepo | `yarn workspaces` |
| Build | `tsup` (esbuild) |
| LLM SDK | **Vercel AI SDK** (`ai` + provider packages) |
| Tokenizer | `gpt-tokenizer` |
| Diff lib | `diff-match-patch` |
| Syntax highlight | `react-syntax-highlighter` |
| Tree-sitter | `web-tree-sitter` + grammar packages (TS, JS, Python, Go, Rust) |
| MCP SDK | `@modelcontextprotocol/sdk` (cho external MCP servers) |
| Validation | `zod` (schemas cho structured output) |
| Logging | `pino` |

### 10.2 Test Strategy (Q14 grill)

| Layer | Tool |
|-------|------|
| Unit test (all packages) | `vitest` |
| Ink component test | `ink-testing-library` |
| TUI e2e test | `playwright` (spawn CLI process, assert output) |
| Integration test | `vitest` |

### 10.3 Hệ điều hành mục tiêu

- **Windows 11** (PowerShell 5.1+, PowerShell 7+) — primary
- **Linux** (bash/zsh) — secondary
- **macOS** (zsh) — secondary

### 10.4 Coding conventions

- `"strict": true`, `"noUncheckedIndexedAccess": true`
- ESM modules (`"type": "module"`)
- Path mapping: `#diff`, `#agent`, `#workflow`, etc.
- Error handling: return `Result<T, E>`, không `throw` từ public API
- Logging: structured JSON via `pino`
- Path: `node:path` + `path.join()`, không hardcode separator

### 10.5 License & Package

- **License:** Apache-2.0 (xem [ADR-0004](../../adr/0004-apache-2.0-license.md))
- **Package:** `@awecode/cli` (binary: `awecode`)
- **Telemetry:** opt-in only, không gửi source code

---

## 11. Roadmap

### v0.1 (MVP — 14-16 tuần)

| Tuần | Delivery |
|------|----------|
| 1-2 | Monorepo setup + LLM Provider Adapter (Vercel AI SDK) + first-run wizard |
| 3-4 | Chat loop + tool calling + Intent Declaration detection |
| 5-6 | Search/replace diff engine + anchor positioning + fuzzy matcher |
| 7-8 | Workflow Engine: skill loader, `invoke_skill`, slash commands, 4 built-in skills |
| 9-10 | Git worktree harness + cross-platform shell + Self-heal Loop guards |
| 11-12 | Repo Map với tree-sitter (TS/JS/Python/Go/Rust) |
| 13-14 | Ink TUI: 3-panel layout, Context panel, Approval Mode, editor integration |
| 15-16 | Buffer + e2e test + Windows PowerShell compat hardening |

**Definition of Done v0.1:** End-to-end creative task (refactor + test) trên repo Windows → auto workflow → diff apply → self-heal → approval → merge. Không crash, không corrupt.

### v0.2

- Docker sandbox mode
- MCP client integration cho external tools
- Plugin install command (`awecode install <package>`)
- Cascade model fallback
- Plan-approve workflow ở agent decision level

### v0.3+

- Plugin marketplace
- Web UI (companion)
- Multi-agent orchestration
- Cloud session sync

---

## 12. Grill Session Notes

Spec v1 được review qua 4 round grilling (20 questions) dùng skill `grill-with-docs-v2`. Tổng hợp quyết định:

| # | Quyết định |
|---|------------|
| Q1 | "Task" = multi-turn goal |
| Q2 | Self-heal: hybrid control |
| Q3 | Worktree ID: UUID + GC 24h |
| Q4 | Error format: structured JSON với suggestions |
| Q5 | Approval: non-blocking, queue cuối turn |
| Q6 | Workflow engine: auto-detect theo intent |
| Q7 | Skill format: SKILL.md thuần |
| Q8 | Skill layout: built-in + user + project |
| Q9 | Skill composition: `invoke_skill()` tool |
| Q10 | Session state: `.awecode/session.json` |
| Q11 | Intent detect: agent emit `start_workflow(name)` |
| Q12 | Editor: `$EDITOR` → `$VISUAL` → `code` → `notepad`/`nano` |
| Q13 | MCP: built-in native, external MCP cho extensibility |
| Q14 | Test: vitest + ink-testing-library + playwright |
| Q15 | Timeline: 14-16 tuần |
| Q16 | Structured JSON: native API tool_use / response_format |
| Q17 | Worktree mgmt: CLI subcommand + slash command |
| Q18 | Insert position: anchor-based |
| Q19 | Repo map: ship v0.1 full (5 ngôn ngữ) |
| Q20 | LLM: Vercel AI SDK + OpenAI-compat + first-run wizard + native modules |

ADRs tạo: [0001](../../adr/0001-vercel-ai-sdk-for-llm-abstraction.md), [0002](../../adr/0002-workflow-engine-auto-trigger-by-intent.md), [0003](../../adr/0003-anchor-based-diff-insert-positioning.md), [0004](../../adr/0004-apache-2.0-license.md).

---

## 13. Tham khảo

- **Aider:** https://github.com/aider-AI/aider — diff format, repo map
- **Plandex:** https://github.com/plandex-ai/plandex — harness, plan flow
- **OpenCode:** https://github.com/sst/opencode — tool calling, MCP
- **Cline:** https://github.com/cline/cline — context tracking UI
- **SWE-agent:** https://github.com/princeton-nlp/SWE-agent — ACI guards
- **Ink:** https://github.com/vadimdemedes/ink — TUI framework
- **Vercel AI SDK:** https://sdk.vercel.ai/ — LLM abstraction
- **diff-match-patch:** https://github.com/google/diff-match-patch — fuzzy matching
- **superpowers:** https://github.com/obra/superpowers — skill system pattern
- **grill-with-docs-v2:** https://github.com/obra/superpowers — grilling methodology
