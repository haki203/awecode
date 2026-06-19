# LLM-based context Compaction with adaptive truncation

Awecode uses LLM-based summarization for context Compaction, triggered automatically at 85% (moderate, summarize oldest 50%) or 95% (severe, summarize oldest 75%) of context budget. Users can trigger manually via `/smol` (alias `/condense`) slash command. Before each Compaction, a checkpoint is saved to `.awecode/history/` for restore.

We rejected pure rule-based truncation (drops critical context silently — Aider pattern loses task decisions). We rejected no-compaction (long Tasks fail at context limit). We rejected the word `/compact` for the slash command because Cline issue #7222 documented models misinterpreting it as a UI request.

Strategy informed by:
- **Cline** — `ContextManager` class, adaptive 50%/75% truncation, `/smol` command, Condense Conversation UI button
- **Aider** — `/tokens` command for transparency, `--map-tokens` config
- **Cline issues #5790, #7222** — lessons on auto-compact losing context and command naming

## Status

Accepted (2026-06-19)

## Consequences

- Adds 1 new canonical term to CONTEXT.md: **Compaction**.
- Adds `/smol` (alias `/condense`), `/tokens`, `/checkpoint`, `/restore` slash commands.
- Adds `.awecode/history/` directory for checkpoints.
- LLM summarization calls use a small model (configurable via `compaction.model` in `.agentrc.yaml`) to minimize cost.
- Repo Map is exempt from Compaction (already compressed).
- Disable via `compaction.autoCompact: false` → fallback to rule-based truncation.
