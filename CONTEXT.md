# Awecode

A CLI coding agent that combines Aider-style search/replace diffs, Plandex-style shadow workspace + self-healing, and a built-in workflow engine that auto-detects task complexity to run brainstorm→spec→grill→plan pipeline when needed.

## Language

**Task**:
A user-stated goal that runs from the initial prompt until the agent declares it done. Multi-turn by default. Bounds a session and all worktrees, context entries, and approval flows created for it.
_Avoid_: request, prompt, message (these are single-turn; Task is the whole goal)

**Workflow**:
A named sequence of phases the agent runs to produce a design artifact before implementation. Built-in workflows: `brainstorm` → `spec` → `grill` → `plan`. Triggered automatically for creative/build Tasks via Intent Declaration; skipped for simple Tasks (which run in Direct Mode). Phases can be skipped or invoked individually via slash commands.
_Avoid_: pipeline (too infrastructure-flavored), process

**Skill**:
A SKILL.md document that teaches the agent how to execute a Workflow phase. Skills are loaded from built-in, user-global, or project-local directories. Composable via the `invoke_skill()` tool.
_Avoid_: plugin (reserved for v0.2+ external extensions), module (overloaded with package modules)

**Worktree**:
A git worktree under `.awecode/worktrees/<uuid>/` where the agent applies diffs and runs commands in isolation from the user's working directory. Lifecycle bounded by the **Diff Cycle** (one worktree per LLM diff response); garbage-collected after 24h of session exit.
_Avoid_: shadow directory (we don't use copy/symlink — only native git worktree), sandbox (sandbox is the security layer; worktree is the isolation unit)

**Diff Cycle**:
One iteration from LLM emits diff → approval → worktree create → apply → self-heal → merge → commit → worktree cleanup. A Task has many Diff Cycles; each cycle owns one Worktree. User-visible in TUI and logs (e.g. "cycle 2/5 failed").
_Avoid_: turn (overloaded — a turn is one user message + agent reply; a cycle is specifically the diff→merge pipeline), iteration (too generic)

**Direct Mode**:
The agent state when no Workflow is active. The agent receives a prompt and responds directly (chat-style) without going through brainstorm→spec→grill→plan phases. Used for simple Tasks (typo fix, single-file edit, factual query).
_Avoid_: chat mode (too generic), inline mode (suggests inline edit), normal mode (meaningless)

**Diff Block**:
A pair `(search, replace)` with optional anchor metadata. The atomic unit of file change produced by the agent and reviewed per-block in Approval Mode.
_Avoid_: patch (reserved for git patch format), edit (too generic)

**Approval Mode**:
TUI state at end of an agent turn where the user reviews each Diff Block sequentially (`y/n/e/s/a/q`). Non-blocking during streaming — diff blocks queue during agent response, approval happens after.
_Avoid_: review (overloaded with code review), confirm

**Self-heal Loop**:
Bounded retry cycle: run command → capture stderr → agent generates new diff → apply → re-run. Hybrid control: agent auto-retries up to `maxSteps`; on `maxConsecutiveSameError` user takes over.
_Avoid_: retry loop (too generic), fix loop

**Context Entry**:
A tracked unit of information in the agent's context window: file (full or partial), command output, diff block, repo-map, or snippet. Has explicit token count and source (`user` or `agent`). Visible and removable from the TUI.
_Avoid_: context item, message (overloaded)

**Repo Map**:
A tree-sitter-generated outline of the entire repository (symbol names + signatures, no bodies) injected into context so the agent knows what exists without reading every file. v0.1 supports TypeScript, JavaScript, Python, Go, Rust.
_Avoid_: codebase index (different concept — we don't do vector search), AST (we use AST internally but Repo Map is the user-facing outline)

**Intent Declaration**:
The mechanism by which the agent announces which Workflow (if any) to start. Done via the agent emitting a `start_workflow(name)` tool call at the top of its response. Replaces an external classifier LLM.
_Avoid_: classifier, router

**Compaction**:
The process of reducing conversation history size by LLM-based summarization. Triggered automatically at 85% (moderate) or 95% (severe) of context budget, or manually via `/smol` slash command. Preserves original task, currently-edited files, last 5 turns, workflow artifact references; discards verbose tool output and redundant reads.
_Avoid_: compression (overloaded with gzip), summarization (too generic — Compaction is the specific context-window operation)

## Relationships

- A **Task** runs in exactly one mode at a time: **Direct Mode** or a **Workflow**
- A **Task** owns many **Diff Cycles** (across its lifetime) and a stream of **Context Entries**
- Each **Diff Cycle** owns exactly one **Worktree** (created at cycle start, removed at cycle end)
- A **Task** transitions from Direct Mode into a **Workflow** via an **Intent Declaration**
- A **Workflow** is composed of **Skills** invoked via `invoke_skill()`
- Each **Diff Block** targets one file and is reviewed in **Approval Mode**
- A **Self-heal Loop** runs inside a **Worktree** during a **Diff Cycle** and produces replacement **Diff Blocks**
- A **Repo Map** is a special kind of **Context Entry**

## Example dialogue

> **User:** "Build me a CSV import feature with validation."
> **Agent:** *(emits `start_workflow("brainstorm")` tool call)* "This is a creative Task — I'll start with brainstorming to explore requirements."
>
> **User:** "Fix the typo 'recieve' → 'receive' in src/utils.ts"
> **Agent:** *(no workflow tool call)* "Fixed. Diff block ready for approval."
>
> **Dev:** "When does Self-heal Loop hand off to the user?"
> **Domain expert:** "When the same stderr appears `maxConsecutiveSameError` times in a row — the agent isn't making progress, so we stop and ask."
>
> **Dev:** "Is a Worktree the same as a sandbox?"
> **Domain expert:** "No — Worktree is the isolation unit (git worktree). Sandbox is the security layer on top (network isolation, optional Docker). A Worktree can exist without Docker sandbox; Docker sandbox always contains a Worktree."

## Flagged ambiguities

- "session" was used to mean both an interactive TUI session and a persistent Task — resolved: **Session** = interactive TUI process; **Task** = the user's goal (may span multiple Sessions via resumable state in `.awecode/session.json`).
- "diff" was overloaded — resolved: **Diff Block** = atomic search/replace pair; **Diff** = the rendered visual output in Approval Mode (composed of one or more Diff Blocks).
- "shadow workspace" in early brainstorming — resolved: rejected in favor of **Worktree** (native git worktree, not copy-based shadow directory).
- "chat mode" / "normal mode" used informally for the no-workflow state — resolved: canonical term is **Direct Mode**.
- "plugin" vs "skill" overlap — resolved: **Skill** ships in v0.1 (SKILL.md prompt + tool composition); **Plugin** (native code package) deferred to v0.2+.
- "worktree lifecycle bounded by Task" was ambiguous (early CONTEXT.md said Task-bounded; Plan 4 implementation suggested per-diff) — resolved (Plan 6 grill Q1): **Worktree** lifecycle is bounded by the **Diff Cycle** (one worktree per LLM diff response, across the Task's many cycles). **Diff Cycle** added as canonical term.
