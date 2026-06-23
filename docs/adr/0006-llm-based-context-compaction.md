# LLM-based context Compaction with adaptive truncation

Awecode uses LLM-based summarization for context Compaction, triggered automatically at 85% (moderate, summarize oldest 50%) or 95% (severe, summarize oldest 75%) of context budget. Users can trigger manually via `/compact` slash command (aliases: `/smol`, `/condense`). Before each Compaction, a checkpoint is saved to `.awecode/history/` for restore.

We rejected pure rule-based truncation (drops critical context silently — Aider pattern loses task decisions). We rejected no-compaction (long Tasks fail at context limit). The command is `/compact` — aligning with Cline, Cursor, and standard AI assistant vocabulary. ADR-0006 originally standardised on `/smol` based on a misreading of Cline issue #7222; that issue is about *models* mis-emitting `/compact` as a tool call when a user says "compact the conversation", not about the slash command name being confusing. `/smol` and `/condense` are retained as aliases.

Strategy informed by:
- **Cline** — `ContextManager` class, adaptive 50%/75% truncation, `/compact` command (we keep `/smol` + `/condense` as aliases), Condense Conversation UI button
- **Aider** — `/tokens` command for transparency, `--map-tokens` config
- **Cline issues #5790, #7222** — lessons on auto-compact losing context and model-emitted tool calls

## Status

Accepted (2026-06-19); revised 2026-06-22 to canonicalise `/compact` and document the Cline #7222 misreading.

## Consequences

- Adds 1 new canonical term to CONTEXT.md: **Compaction**.
- Adds `/compact` (aliases `/smol`, `/condense`), `/tokens`, `/checkpoint`, `/restore` slash commands.
- Adds `.awecode/history/` directory for checkpoints.
- LLM summarization calls use a small model (configurable via `compaction.model` in `.agentrc.yaml`) to minimize cost.
- Repo Map is exempt from Compaction (already compressed).
- Disable via `compaction.autoCompact: false` → fallback to rule-based truncation.
