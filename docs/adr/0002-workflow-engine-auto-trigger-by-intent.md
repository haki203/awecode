# Workflow engine auto-triggers based on agent-declared intent

The agent decides whether to run a brainstorm→spec→grill→plan pipeline by emitting a `start_workflow(name)` tool call at the top of its response. Simple tasks (typo fix, single-file edit, factual query) skip the workflow and behave like a standard Aider-style chat loop. Creative/build tasks (new feature, large refactor, architectural change) auto-trigger the pipeline.

We rejected "always run pipeline" (friction on trivial tasks — fixing a typo shouldn't require brainstorming) and rejected "user must type `/brainstorm` explicitly" (hides the USP from new users). The auto-detect approach matches the pattern used by Claude Code's skills: the agent invokes the workflow when intent matches, with the user able to override.

## Status

Accepted (2026-06-19)

## Consequences

- First turn of every task adds one small tool call overhead (negligible latency/cost).
- Built-in skills (`brainstorm`, `spec`, `grill`, `plan`) ship in the binary at `awecode/skills/` so they're available without user setup.
- Skill resolution order: project `.awecode/skills/` > user `~/.config/awecode/skills/` > built-in. Users can override or extend any built-in.
- Skills compose via `invoke_skill(name)` tool — a skill can call another skill, enabling nested workflows.
- Session state persists to `.awecode/session.json` for resumable workflows across TUI sessions.
- Adds a `packages/workflow` package with skill loader + slash-command dispatcher.
