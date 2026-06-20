# Harness

The harness provides git worktree-based isolation for agent operations.

## Worktree lifecycle

1. **Create:** agent calls `createWorktree(projectRoot)` → new branch `agent/<uuid>` checked out in `.awecode/worktrees/<uuid>/`
2. **Operate:** agent applies diffs and runs commands inside the worktree
3. **Merge:** on approval, `mergeToWorkingDir` merges the worktree branch back to the working branch
4. **Cleanup:** worktrees auto-cleaned after 24h, or manually via `awecode worktree clean`

## Self-heal Loop

When a command (typically tests) fails in the worktree:

1. stderr captured and fed back to agent
2. Agent generates a new diff
3. Diff applied, command re-run
4. Bounded by 5 guards:
   - `maxSteps` (default 3) — total retries
   - `maxConsecutiveSameError` (default 2) — same stderr twice → user takeover
   - `totalTimeout` (default 5 min)
   - `commandTimeout` (default 60s per command)
   - `diffFailStreak` (default 3) — consecutive apply failures

## Manual operations

```bash
awecode worktree list        # show active worktrees
awecode worktree clean       # remove stale (>24h) worktrees
awecode worktree clean <id>  # remove specific worktree
```

## Configuring self-heal

```yaml
# .agentrc.yaml
selfHeal:
  maxSteps: 3
  maxConsecutiveSameError: 2
  totalTimeout: 300000
  commandTimeout: 60000
  diffFailStreak: 3
```

## Sandbox modes

- `git-only` (default): worktree isolation only
- `docker` (opt-in): worktree runs in Docker container (v0.2+)
- `isolateNetwork: true`: block outgoing network (v0.2+ — v0.1 logs warning)
