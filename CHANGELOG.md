# Changelog

All notable changes to awecode are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
  thresholds (`/smol`, `/condense`, `/tokens`, `/checkpoint`, `/restore`).
- Repo Map via tree-sitter (TypeScript, JavaScript, Python, Go, Rust)
  with PageRank-style ranking, cached by commit hash.
- Three-panel Ink TUI: context sidebar, chat transcript, workflow
  indicator, token bar with OK/MODERATE/SEVERE level.
- Slash command framework: workflow + compaction commands registered
  idempotently on chat startup.
- Apache-2.0 license, ADR-0001 through ADR-0006, CONTEXT.md with 12
  canonical domain terms.
