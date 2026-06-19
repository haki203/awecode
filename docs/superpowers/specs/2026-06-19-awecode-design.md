# Awecode — CLI Coding Agent (Design Spec)

**Ngày:** 2026-06-19
**Trạng thái:** Approved (sau brainstorming)
**Scope:** v0.1 — MVP có Harness + Self-heal, tiến hóa lên v0.2+ với full USP

---

## 1. Mục tiêu

Xây dựng CLI Coding Agent bằng TypeScript, lấy **cảm hứng** (không fork code) từ:

- **Aider** — cơ chế search/replace diff (`<<<< SEARCH / ==== / >>>> REPLACE`)
- **Plandex** — tư duy shadow workspace + self-healing loop
- **OpenCode** — giao tiếp MCP và tool calling schema
- **Cline** — explicit context tracking + UI panel
- **SWE-agent** — Agent-Computer Interface guards tránh infinite loop

**Ambition:** Học sâu → personal tool → open-source MVP → có đường tiến hóa commercial.

**Success criterion v0.1:** End-to-end task phức tạp trên repo Windows (refactor function + thêm test) hoàn thành không crash, không corrupt file.

---

## 2. Non-Goals (v0.1)

Những thứ **gián tiếp** loại bỏ để giữ scope:

- Multi-model auto-routing (chỉ manual `--model`)
- Plan-approve workflow kiểu Plandex
- Plugin system / marketplace
- Web UI (chỉ TUI)
- Docker mặc định (chỉ opt-in config)
- Container integration `.devcontainer`
- MCP server hosting (chỉ MCP client)

---

## 3. Architecture Tổng thể

### 3.1 Sơ đồ

```
┌─────────────────────────────────────────────────────────┐
│                      CLI Entry (Ink TUI)                 │
│            packages/cli — React components, input, view  │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                    Agent Core                            │
│  packages/agent — chat loop, tool dispatcher,            │
│  context manager (token budget), approval gate           │
└─────┬──────────────────┬──────────────────┬──────────────┘
      │                  │                  │
      ▼                  ▼                  ▼
┌──────────┐     ┌──────────────┐    ┌──────────────┐
│ Diff     │     │ Harness      │    │ Tools        │
│ Engine   │     │ (git wt)     │    │              │
│          │     │              │    │ - file ops   │
│ search/  │     │ worktree,    │    │ - shell exec │
│ replace, │     │ run cmd,     │    │ - grep/glob  │
│ fuzzy    │     │ capture err, │    │ - MCP client │
│ match    │     │ self-heal    │    │              │
└──────────┘     └──────────────┘    └──────────────┘
      │                  │                  │
      └──────────────────┼──────────────────┘
                         ▼
              ┌───────────────────────┐
              │  LLM Provider Adapter │
              │  (Anthropic, OpenAI,  │
              │   local Ollama)       │
              └───────────────────────┘
```

### 3.2 Packages và trách nhiệm

| Package | Trách nhiệm | Phụ thuộc |
|---------|-------------|-----------|
| `cli` | TUI Ink, user input, render diff/context/approval | `agent` |
| `agent` | Chat loop, tool dispatcher, context budget, approval flow | `diff`, `harness`, `tools`, `llm` |
| `diff` | Parse search/replace format, fuzzy match, apply to file | (none, pure) |
| `harness` | Git worktree lifecycle, run shell command, capture stderr, self-heal loop | `tools` (cho shell exec) |
| `tools` | Tool implementations: file ops, shell, grep, glob, MCP client | (none, leaf) |
| `llm` (sub-package trong `agent` hoặc riêng) | Provider adapter, stream response, tool call parsing | (none) |

**Nguyên tắc:**

- `diff` và `tools` là pure leaf — test đơn giản, không phụ thuộc IO
- `agent` chỉ orchestrate — không chứa logic diff/shell/git trực tiếp
- `cli` chỉ render — không chứa business logic
- Mỗi package export typed API, test độc lập

---

## 4. Diff Engine (`packages/diff`)

Module quan trọng nhất — quyết định agent sửa file có chính xác không.

### 4.1 Format LLM trả về

```
file_path: src/utils/parser.ts
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

- `file_path` header xác định target file
- `at: <line>` header (tùy chọn) — chỉ định vị trí insert (mặc định: cuối file)
- Nhiều block SEARCH/REPLACE trong 1 file → áp dụng tuần tự từ trên xuống
- Block SEARCH rỗng + REPLACE có nội dung → **insert** tại vị trí `at` (hoặc cuối file nếu không có)
- **Delete file:** không dùng diff rỗng (ambiguous với file lớn) — agent phải gọi tool `delete_file: <path>` riêng
- Có thể có nhiều `file_path` section trong 1 LLM response

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
}

export interface ParsedDiff {
  filePath: string;
  blocks: DiffBlock[];
}

export function parseDiff(llmOutput: string): ParsedDiff[];

export function applyDiff(source: string, blocks: DiffBlock[]): ApplyResult;

export type ApplyResult =
  | { ok: true; result: string }
  | { ok: false; error: 'no_match'; block: DiffBlock; bestScore: number }
  | { ok: false; error: 'ambiguous'; matches: number };
```

### 4.4 Edge cases

- SEARCH không khớp → trả `no_match` với best similarity score → agent loop đẩy lại LLM kèm error context
- SEARCH khớp nhiều vị trí → `ambiguous` → LLM phải cung cấp thêm context trong SEARCH
- File không tồn tại → caller (agent) quyết định: tạo file mới nếu REPLACE có nội dung
- File binary hoặc quá lớn (>100KB) → trả error, agent không apply

### 4.5 Lý do chọn `diff-match-patch`

- Proven (Google Docs dùng)
- Cross-platform JS thuần
- Tránh bug ở fuzzy matcher = bug lan ra mọi file edit

---

## 5. Harness Workspace (`packages/harness`)

Cross-platform (Windows/Linux/Mac), dùng **native git worktree**.

### 5.1 Lifecycle

```
1. User yêu cầu task cần test (vd: "refactor + test parser.ts")
   ↓
2. harness.createWorktree()
   - git worktree add .agent-ws/<id> -b agent/<id>
   - .agent-ws/ được .gitignore tự động
   - Trả về path: <projectRoot>/.agent-ws/<id>
   ↓
3. Agent apply diff vào worktree (KHÔNG vào working dir của user)
   diff engine nhận path = worktree path
   ↓
4. Agent gọi harness.runCommand('yarn test')
   - cwd = worktree path
   - Capture stdout, stderr, exitCode
   - Timeout mặc định 60s (config)
   ↓
5. Test pass?
   - yes → Approval UI → user y/n/e → merge hoặc discard
   - no  → Self-heal loop:
          - Đẩy stderr vào context
          - Agent sửa diff mới
          - Re-run command
          - Cap N=3 steps (config)
          ↓
6. Đạt step cap → notify user, show final stderr,
   hỏi giữ worktree hay discard
```

### 5.2 Cross-platform Shell Execution

**Vấn đề:** LLM có thể sinh `rm file.js` (bash) thay vì `Remove-Item file.js` (PowerShell).

**Giải pháp 2 lớp:**

**Lớp 1 — Tool interface có command normalization:**

```ts
// packages/tools/shell.ts
export interface ShellCommand {
  cmd: 'rm' | 'mkdir' | 'cp' | 'mv' | 'cat' | 'echo' | 'custom';
  args: string[];
}

// Harness detect platform, map sang PowerShell/cmd.exe hoặc bash
function normalizeForPlatform(cmd: ShellCommand): string[] {
  if (process.platform === 'win32') {
    return mapToPowerShell(cmd);  // rm -> Remove-Item, mkdir -> New-Item -ItemType Directory, etc.
  }
  return mapToBash(cmd);
}
```

**Lớp 2 — Nếu LLM sinh raw shell string:**

- Tool `shell_exec` luôn chạy qua `child_process.spawn` với shell detect
- Trên Windows: spawn `powershell.exe -Command <cmd>` (mặc định), hoặc `cmd.exe /c` nếu user config
- Trên Linux/Mac: spawn `/bin/bash -c <cmd>` (mặc định), hoặc zsh nếu config
- **Tuyệt đối không parse/censor LLM shell** — agent đang làm việc trong worktree cô lập, có thể rollback bằng `git checkout`. Lỗi trong worktree = không phá working dir.

### 5.3 Self-heal Loop Guards

| Guard | Mặc định | Lý do |
|-------|----------|-------|
| `maxSteps` | 3 | Hết bước → hỏi user, tránh infinite loop |
| `maxConsecutiveSameError` | 2 | Cùng stderr 2 lần liên → LLM không sửa được, dừng |
| `totalTimeout` | 5 phút | Cả loop không quá 5 phút |
| `commandTimeout` | 60s | 1 lệnh test không quá 60s |
| `diffFailStreak` | 3 | Diff apply fail 3 lần liên → đẩy lại LLM với error context |

### 5.4 Sandbox Modes

User chọn sandbox mode qua config `.agentrc.yaml`:

| Mode | Cài đặt | Bảo vệ |
|------|---------|--------|
| `git-only` (default) | Git worktree trong project | Lỗi trong worktree → rollback bằng `git checkout` |
| `docker` (opt-in) | Worktree trong container Docker | Cô lập hoàn toàn process/filesystem |
| `isolateNetwork: true` (default ON cho mọi mode) | Block outgoing HTTP từ code LLM sinh | Ngừa LLM gọi API lấy token |

**Network isolation theo mode:**

- **`docker` mode:** Block qua `--network=none` của Docker. Clean.
- **`git-only` mode (Windows):** Thiết lập Windows Firewall rule tạm thời cho PID của child process (`netsh advfirewall firewall add rule ...`) — cleanup khi process exit. Cần quyền user (không cần admin cho user-scope rule).
- **`git-only` mode (Linux):** Dùng `unshare -n` (cần user namespace) hoặc `firejail --net=none` nếu có.
- **`git-only` mode (macOS):** Dùng `sandbox-exec` với profile deny network.

Nếu platform không support (vd Windows cũ không có firewall scope phù hợp), log warning và tiếp tục — agent vẫn cô lập qua git, chỉ mất network block.

**Config `.agentrc.yaml`:**

```yaml
sandbox:
  mode: git-only          # | docker
  isolateNetwork: true
  commandTimeout: 60
  totalTimeout: 300

selfHeal:
  maxSteps: 3
  maxConsecutiveSameError: 2
  diffFailStreak: 3
```

**Vì sao không ép Docker mặc định:**

- Docker Desktop trên Windows cần WSL2, license commercial với công ty lớn
- Overhead start container 1-3s ăn giấc ngủ dev experience
- `git worktree + network block` đã giảm rủi ro chính

### 5.5 Merge về working dir

```ts
// packages/harness/merge.ts
async function mergeToWorkingDir(
  worktreePath: string,
  options: { mode: 'git-merge' | 'file-copy' }
): Promise<MergeResult>
```

- **`git-merge` (default):** `git merge agent/<id>` vào branch hiện tại. Conflict → report về TUI, user resolve.
- **`file-copy`:** Sao chép diff bytes thẳng sang working dir (khi user không muốn tạo branch).

---

## 6. Context Manager (`packages/agent/context.ts`)

USP "Context Transparency" — user thấy chính xác cái gì đang trong context.

### 6.1 Context Structure

```ts
interface ContextEntry {
  id: string;
  type: 'file' | 'snippet' | 'symbol' | 'command-output' | 'diff' | 'repo-map';
  path?: string;
  lines?: { start: number; end: number };  // for partial files
  tokens: number;
  addedAt: number;
  addedBy: 'user' | 'agent';
}

interface Context {
  entries: ContextEntry[];
  totalTokens: number;
  budget: number;  // model context window - reserve
}
```

### 6.2 Operations

| Operation | Mô tả |
|-----------|-------|
| `addFile(path, lines?)` | Đọc file (hoặc partial), estimate tokens, thêm entry |
| `addRepoMap()` | Tree-sitter parse cả repo → outline ngắn (như Aider) |
| `removeEntry(id)` | User xóa file khỏi context qua TUI |
| `summarize()` | Khi gần full budget: LLM tóm tắt entry cũ nhất → giảm tokens |
| `refreshFile(path)` | Re-read content mới nhất khi file modify qua diff |
| `toPrompt()` | Serialize tất cả entries thành system/user messages cho LLM |
| `snapshot()` | Trạng thái hiện tại cho TUI render |

### 6.3 Token Estimation

Dùng `gpt-tokenizer` (JS pure, không cần Python). Xấp xỉ tốt cho cả OpenAI và Anthropic (cùng họ BPE tương tự).

### 6.4 Pattern picked từ OSS research

| Pattern | Lấy từ | Lý do |
|---------|--------|-------|
| Repo map via tree-sitter | Aider | Cho LLM "biết" codebase với ít token |
| Explicit token tracking + UI panel | Cline | Đúng USP Context Transparency |
| File content auto-refresh mỗi turn | Plandex | Tránh bug "LLM thấy code cũ" |
| Auto-summarize khi gần full (không drop) | Cline condense | Giữ task context, không mất info |
| Partial-file (lines range) | Mới — USP riêng | Select `lines 10-50` thay vì cả file |

### 6.5 Auto-management rules

| Trigger | Action |
|---------|--------|
| `totalTokens > 0.85 * budget` | Hỏi user: summarize hoặc remove entry |
| File modify qua diff engine | Tự `refreshFile` entry với content mới |
| Agent gọi `read_file` tool | Tự thêm vào context |
| Diff apply fail 3 lần | Auto re-add file full content (LLM có thể nhìn sai indent) |

### 6.6 Context Transparency TUI

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

## 7. TUI + Approval Flow (`packages/cli`)

### 7.1 Layout Ink (3 panel)

```
┌─ Context (12k/100k) ──┬─ Conversation ──────────────────────┐
│ ▓▓▓░░░░░░░░░░░░░░░░   │ User: refactor parseDiff + add test │
│                       │                                      │
│ [user] parser.ts      │ Agent: I'll create a worktree and   │
│        234 tok  [x]   │ start by reading the current impl.  │
│ [user] parser.test    │                                      │
│        156 tok  [x]   │ → tool: read_file(parser.ts)        │
│ [agent] yarn test     │ ← 234 lines                         │
│        421 tok  [x]   │                                      │
│ [agent] diff (patch)  │ Agent: Here's my plan:              │
│         89 tok  [x]   │ 1. Extract parser to method         │
│                       │ 2. Add 3 test cases                 │
│ [r] refresh  [s] sum  │                                      │
├───────────────────────┴──────────────────────────────────────┤
│ > _                                                          │
└──────────────────────────────────────────────────────────────┘
```

- **Left panel:** Context entries (Section 6), scroll, `[x]` remove
- **Right panel:** Conversation + tool calls
- **Bottom:** Input prompt

### 7.2 Approval Flow — `git add -p` style

Khi agent apply diff, TUI chuyển sang **approval mode**:

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
| `e` | Mở `$EDITOR` (vim/code/notepad) edit diff bằng tay |
| `s` | Skip block này, tiếp block kế |
| `a` | Accept tất cả blocks còn lại |
| `q` | Quit approval, discard tất cả |
| `?` | Help |

### 7.3 Session state machine

```
                user input
   Idle ──────────────────► Thinking (stream)
     ▲                          │
     │                          ▼
     │ no diff      Tool Call Running
     │                          │
     │                          ▼
     │                    Tool Done ──diff───► Approval Mode
     │                          │              │       │
     │                          │            accept  reject
     │                          │              │       │
     │                          ▼              ▼       ▼
     │                      (continue)   Apply worktree  Notify agent
```

### 7.4 Ink components

```ts
// packages/cli/components/
- <App />              — root, manage state
- <ContextPanel />     — left sidebar
- <Conversation />     — right panel, stream messages
- <DiffPreview />      — render diff block với syntax highlight (react-syntax-highlighter)
- <ApprovalPrompt />   — y/n/e/s/a/q/? keys
- <TokenBar />         — progress bar context budget
- <Spinner />          — streaming state
```

---

## 8. Quy chuẩn Kỹ thuật

### 8.1 Stack

| Thành phần | Lựa chọn | Lý do |
|------------|----------|-------|
| Ngôn ngữ | TypeScript (strict mode) | Type safety, ecosystem |
| Runtime | Node.js 20 LTS | Stability, compat Windows |
| Package manager | `yarn` (berry v4) | Anh chọn |
| TUI | `ink` v5 + `react` v18 | React components cho CLI |
| Monorepo | `yarn workspaces` | Đơn giản, native yarn |
| Build | `tsup` (esbuild) | Fast, zero-config |
| Test | `vitest` | Fast, ESM-native |
| Lint | `eslint` + `prettier` | Standard |
| Diff lib | `diff-match-patch` | Google's proven library |
| Tokenizer | `gpt-tokenizer` | JS pure |
| Syntax highlight | `react-syntax-highlighter` | Ink-compatible |
| Tree-sitter | `web-tree-sitter` | Repo map |
| LLM SDK | `@anthropic-ai/sdk`, `openai`, `ollama` | 3 providers |
| MCP SDK | `@modelcontextprotocol/sdk` | Official |

### 8.2 Hệ điều hành mục tiêu

- **Windows 11 (PowerShell 5.1+, PowerShell 7+)** — primary, dev machine
- **Linux (bash/zsh)** — secondary
- **macOS (zsh)** — secondary

### 8.3 Coding conventions

- **Strict TypeScript:** `"strict": true`, `"noUncheckedIndexedAccess": true`
- **ESM modules** (`"type": "module"` trong package.json)
- **Path mapping:** imports tuyệt đối trong package (vd `#diff`, `#agent`)
- **Error handling:** Không bao giờ `throw` từ public API — return `Result<T, E>` type
- **Logging:** Structured JSON log qua `pino`, configurable level
- **Path handling:** Luôn dùng `node:path` + `path.join()`, không bao giờ concatenate string

### 8.4 PowerShell compat (constraint quan trọng)

- Mọi child process spawn qua `child_process.spawn` với shell option đúng platform
- Path normalize: dùng `path.win32` hoặc `path.posix` tùy platform detect
- Environment variables: set qua `process.env` (Node handle cross-platform)
- File operations: dùng `fs/promises` API (cross-platform)
- Không bao giờ hardcode `/` hoặc `\` trong code logic

---

## 9. Roadmap

### v0.1 (MVP — 8 tuần)

| Tuần | Delivery |
|------|----------|
| 1-2 | Chat loop + 1 LLM provider (Anthropic) + tool calling format |
| 3 | Search/replace diff engine với `diff-match-patch` fuzzy matcher |
| 4-5 | Git worktree harness + shell exec tool + cross-platform normalize |
| 6 | Self-healing loop với guards (cap N, timeout) |
| 7-8 | Ink TUI: 3-panel layout, context panel, approval flow |

**Definition of Done v0.1:** End-to-end task phức tạp (refactor + test) trên repo Windows chạy thành công, không crash, không corrupt file.

### v0.2

- Thêm OpenAI và Ollama providers
- Repo map via tree-sitter
- Partial-file context (lines range)
- Docker sandbox mode
- MCP client cho external tools (mặc dù SDK đã có trong v0.1, integration mới ở v0.2)

### v0.3+

- Rule-based model routing (task → model)
- Plan-approve workflow
- Plugin system
- Cascade fallback (cheap → strong model)

---

## 10. Open Questions (ghi nhận, giải quyết sau)

1. **License chọn gì?** MIT (permissive, dễ attract contributor) hay Apache-2.0 (patent grant)?
2. **Branding / tên package trên npm?** `awecode` đã có chưa?
3. **Telemetry / analytics?** Opt-in hay opt-out? (OSS nên opt-in)
4. **Config file location?** `.agentrc.yaml` trong project root, hay `~/.config/awecode/`?

Các câu này không block implementation v0.1 — chọn default reasonable (MIT, `awecode` package name, opt-in telemetry, `.agentrc.yaml` local) và quyết định sau.

---

## 11. Tham khảo

- **Aider:** https://github.com/paul-gauthier/aider — diff format, repo map
- **Plandex:** https://github.com/plandex-ai/plandex — harness, plan flow
- **OpenCode:** https://github.com/sst/opencode — MCP client pattern
- **Cline:** https://github.com/cline/cline — context tracking UI
- **SWE-agent:** https://github.com/princeton-nlp/SWE-agent — ACI guards
- **Ink:** https://github.com/vadimdemedes/ink — TUI framework
- **diff-match-patch:** https://github.com/google/diff-match-patch — fuzzy matching
