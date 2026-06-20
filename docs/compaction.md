# Context Compaction

When conversation approaches context budget, awecode compacts via LLM summarization.

## Triggers

| Utilization | Level | Action |
|-------------|-------|--------|
| < 85% | OK | None |
| 85-94% | MODERATE | Summarize oldest 50% |
| 95%+ | SEVERE | Summarize oldest 75%, keep last 5 turns |

## Manual commands

- `/smol` — trigger compaction immediately (alias: `/condense`)
- `/tokens` — show token usage breakdown
- `/checkpoint` — save snapshot
- `/restore <id>` — restore from checkpoint

## Preserve rules

Always preserved through compaction:
- Original task message
- Currently-edited files content
- Last 5 user-assistant turns
- Workflow artifact references

## Checkpoints

Before each compaction, snapshot saved to `.awecode/history/checkpoint-<timestamp>.json`.
