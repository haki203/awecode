# Orchestrator

The orchestrator wires the chat loop to the harness, executing one **Diff Cycle**
per LLM diff response.

## Diff Cycle

1. **Parse** — extract Diff Blocks from assistant text
2. **Approve ALL** — user reviews each block (`y/n/e/s/a/q`) before any pipeline work
3. **Pipeline per block** (transactional):
   - Create Worktree (1 per cycle, reused across blocks)
   - Apply Diff → Self-heal Loop → Merge to Working Dir → Commit
4. **Cleanup** — remove Worktree

## HARNESS-1: diffFailStreak guard

When `applyDiff` fails, the self-heal loop increments `diffFailStreak`. At 3
failures (configurable), the loop aborts. Before abort, the orchestrator injects
a feedback message into the chat loop's `messages` array so the LLM regenerates
the diff in the next iteration.

## Undo

Each cycle produces 0..N commits prefixed `awecode: <taskUuid>`. Undo via:

```
git log --oneline | grep "awecode: <taskUuid>"
git revert <sha>
```

## Out of scope (v0.1)

- TUI rendering (Plan 5b)
- Full "push back to LLM with full file content" (v0.1 just passes error string)
- Ctrl+C signal-thread into `runCommand`
