# Changelog

All notable changes to awecode are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Session resume.** Persisted conversations can now be reopened with full
  agent context. Clicking a past session in the sidebar (Desktop) or the
  "Continue here" button (Web) reconnects the agent seeded with the prior
  transcript. Implements the "follow-up" flagged in ADR-0007.
  - `SessionMessage` schema gained optional `toolCallId` / `toolName` /
    `toolCallArgs` fields so tool-call/result pairs round-trip through the
    resume transform with correct correlation.
  - New `resumeFromMessages(SessionMessage[]) → ModelMessage[]` pure
    transform in `@awecode/agent` handles legacy sessions heuristically
    (best-effort pairing) and modern sessions via `toolCallId` (handles
    parallel tool calls correctly).
  - `ProtocolSession` accepts `initialMessages` (constructor path, used by
    Web ws-bridge) and exposes a `resume(messages)` method (post-creation
    path, used by Desktop AgentBridge via the new `resume` wire command).
    `liveMessages` now appends per prompt instead of resetting, so the
    prior context survives across turns.
  - Web transport (`AwecodeClient`) gained `resume(sessionId)` — reconnects
    with `?sessionId=` query so the server loads the persisted session and
    seeds `initialMessages` into the new `ProtocolSession`.
  - Desktop `AgentBridge.switchTo` transforms the persisted transcript and
    sends it to the fresh child process via the new `resume`
    `GuiClientCommand` variant.
  - One-shot migration wipes legacy session JSONs (those whose tool
    messages lack `toolCallId`) on boot, per "fresh start" user decision.

### Changed
- **Session titles are now much more readable.** `deriveTitle` strips
  fenced/inline code, bold/italic markdown, leading @-mentions and slash
  commands, collapses whitespace, and preserves `snake_case` identifiers
  (no longer mangled as italic). First-sentence split intentionally runs
  on `. ` only — preserves rhetorical questions and code identifiers
  containing `?` / `!`.
- **Sidebar now updates in real time.** The main process emits a
  `session:updated` IPC event after every save; the renderer subscribes
  via the new optional `TransportClient.onSessionUpdated` method and
  patches the list in place. The old 30-second `setInterval` polling is
  gone (kept only a visibilitychange catch-up safety net).
- **Sidebar groups sessions by date** — Today, Yesterday, This week,
  Older (empty buckets are hidden).

### Fixed
- **Context window tracking was never wired to the chat loop.**
  `ContextManager` had full `addFile` / `addCommandOutput` / `addDiff`
  APIs and passing tests, but no production code ever called them after
  a user prompt or assistant reply. Result: `entries[]` stayed empty,
  `totalTokens` stayed `0`, and the statusline showed `0%` for an
  entire conversation. Fixed by tracking user messages, assistant
  replies, and tool results inside `runChatLoop` itself, so both the
  TUI (`chat.tsx`) and the Web/Desktop protocol session
  (`protocol-session.ts`) benefit from the same wire-up. New
  `ContextEntryType` variants: `user-message`, `assistant-message`,
  `tool-result`.

### Changed
- **`/compact` is now the canonical slash command name** for LLM-based
  context summarization (aligns with Cline, Cursor, and standard AI
  assistant vocabulary). `/smol` and `/condense` remain as aliases for
  backwards compatibility and muscle memory. ADR-0006 originally
  standardised on `/smol` based on a misreading of Cline issue #7222
  (that issue is about *models* mis-emitting `/compact` as a tool call
  when prompted, not about users typing `/compact`). The TUI hint in
  `ContextOverlay` now suggests `/compact`.
- **`ContextStatusline` summary now shows conversation turns** (`N
  turns · N files`) when chat entries exist, instead of the misleading
  `N files` label that counted every entry as a file. File-only
  sessions continue to show `N files`.
- `ContextManager` gained `clear()` and `entryCount` for upcoming
  auto-compaction work, and `toMessages()` now emits per-type headers
  (`User`, `Assistant`, `Tool result`, etc.) instead of a generic
  `[type]` tag.

### Added
- **`onContextUpdate` callback on `ChatLoopOptions`** — fires whenever
  `runChatLoop` pushes a new entry (user-message / assistant-message /
  tool-result) into the `ContextManager`. The CLI bumps a `contextVersion`
  state to force `ContextStatusline` / `ContextOverlay` to re-render
  mid-turn; `ProtocolSession` emits a fresh `context_snapshot` event so
  GUI and Web PWA StatusBars update live as the reply streams, not just
  once at `onDone`. This closes the gap that made the meter appear
  frozen even after the wire-up fix.

## [0.1.0] — 2026-06-22

_First feature release: the orchestrator pipeline lands. This version wires
the chat loop to the git worktree harness via the Diff Cycle (parse →
approve → worktree → apply → self-heal → merge → commit → cleanup),
stabilizes the workflow engine auto-trigger, and adds runtime
`--model`/`--provider` overrides._

### Added
- **`--model <name>` runtime flag** — override the active provider's
  `defaultModel` without editing the config file. E.g.
  `awecode --model gpt-4o "fix the bug"` runs the whole chat session
  against `gpt-4o` even if the YAML says `gpt-4o-mini`. Short alias `-m`.
- **`--provider <id>` runtime flag** — switch the active provider by id
  for this session. Must match a key in `providers` in the config file.
  Short alias `-p`.
- **`envKey` field on provider configs** — declare an environment
  variable name instead of hardcoding the API key in YAML. Resolution
  order at load time: explicit `envKey` → inline `apiKey` → provider's
  conventional default (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` /
  `GOOGLE_GENERATIVE_AI_API_KEY`). Users who already export those vars
  can leave the key fields entirely out of the config file.
- **Wizard now asks "How do you want to provide your API key?"** with
  two options: `env` (recommended, key stays out of dotfiles) or `inline`
  (stored in `~/.config/awecode/config.yaml`). Env path pre-fills the
  provider's conventional name so users can just press Enter.
- `@awecode/orchestrator` package: glues the chat loop to the harness
  primitives. Each LLM diff response triggers a full Diff Cycle
  (parse → approve → worktree → apply → self-heal → merge → commit
  → cleanup). Implements Q7/A feedback loop — when `applyDiff` fails,
  the orchestrator injects a synthetic user message into the shared
  `messages` array so the LLM regenerates the diff on the next iteration.
- `detectTestCommand` — auto-detects the test command for Node, Cargo,
  pytest, go, and Makefile-based repos.
- HARNESS-1 fix: `diffFailStreak` guard in the self-heal loop is now
  enforced (was previously declared but dead). New
  `onDiffApplyFailed` callback on `SelfHealCallbacks` and new
  `diff_fail_streak_reached` event variant on `SelfHealEvent`. The loop
  also accepts an optional `AbortSignal` for cooperative cancellation.
- `ApprovalDecision` extended from 4 to 7 variants — added `skip_all`,
  `accept_all`, `quit` to support the full `y/n/e/s/a/q` keystroke set.

### Changed
- `runChatLoop` now mutates the caller-provided `messages` array in place
  instead of copying `initialMessages` (Q7/A enabler). This is a minor
  breaking change for callers that relied on the input array being
  untouched; the returned array is still the same reference.
- The CLI chat command now uses the Orchestrator as the single write path.
  The legacy `ApprovalView` overlay with direct `writeFile` has been
  removed; approval prompting goes through the orchestrator's
  readline-based `ApprovalPrompter` until a future release surfaces the
  orchestrator's phase state in the TUI.

### Fixed
- CLI no longer crashes on startup with `Dynamic require of "fs" is not
  supported`. The `tsup` configs for packages that bundle `simple-git`
  (cli, harness, orchestrator, repomap) now carry a `createRequire` shim
  banner so CJS transitive deps work under Node ESM.
- `yarn test` no longer flakes on Windows with `EBUSY: resource busy or
  locked` when parallel test files race on temp dirs. Root
  `vitest.config.ts` now sets `fileParallelism: false` (module isolation
  remains on, so `vi.mock()` tests still pass).

## [0.0.0] — 2026-06-21

### Added
- Initial public skeleton: 9 packages (`llm`, `diff`, `tools`, `agent`,
  `harness`, `workflow`, `repomap`, `orchestrator`, `cli`).
- Built-in workflow skills: `brainstorm`, `spec`, `grill`, `plan`.
- Context Manager with explicit token tracking and 85%/95% compaction
  thresholds (`/compact` aliases `/smol` `/condense`, plus `/tokens`,
  `/checkpoint`, `/restore`).
- Repo Map via tree-sitter (TypeScript, JavaScript, Python, Go, Rust)
  with PageRank-style ranking, cached by commit hash.
- Three-panel Ink TUI: context sidebar, chat transcript, workflow
  indicator, token bar with OK/MODERATE/SEVERE level.
- Slash command framework: workflow + compaction commands registered
  idempotently on chat startup.
- Apache-2.0 license, ADR-0001 through ADR-0006, CONTEXT.md with 12
  canonical domain terms.
