# Consolidated `.awecode/` directory layout

All awecode state in a project lives under a single `.awecode/` directory at the project root, replacing the earlier split between `.agent-ws/` (worktrees) and `.awecode/` (session state).

We rejected keeping two directories (cognitive overhead — "agent-ws or awecode?") and rejected moving state to `~/.local/share/awecode/<project-hash>/` (breaks team-sharing via git, makes session resumption machine-specific).

Layout:

```
.awecode/
├── session.json              # Task + Workflow state (commit-able)
├── worktrees/<uuid>/         # Git worktrees (gitignored)
├── cache/repo-map.json       # Repo Map cache keyed by commit hash (gitignored)
├── skills/                   # Project-specific skills (commit-able)
└── history/                  # Task history (commit-able, optional)
```

Only `worktrees/` and `cache/` are gitignored. The rest can be committed for team collaboration.

## Status

Accepted (2026-06-19)

## Consequences

- Worktree path changes from `.agent-ws/<uuid>/` to `.awecode/worktrees/<uuid>/` (CONTEXT.md updated).
- Single directory means single `.gitignore` entry pattern: `.awecode/worktrees/` and `.awecode/cache/`.
- Git commit hook can filter awecode commits via message convention `awecode: <task-uuid>`.
- No risk of polluting user's working tree with awecode metadata — everything is under one folder, easy to remove or archive.
