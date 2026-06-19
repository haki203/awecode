# Anchor-based insert positioning in Diff Blocks

When the agent needs to insert new code into an existing file, it specifies position via an anchor symbol rather than a line number. Format: `at: @after: function foo()` or `at: @before: class Bar`. The fuzzy matcher resolves the anchor to a concrete line.

We rejected line-number-based positioning (LLMs are notoriously bad at counting lines from context) and rejected "insert only at end of file" (too restrictive for real-world edits). Anchor-based positioning is robust because the agent knows symbol names from context — it doesn't need to count.

## Status

Accepted (2026-06-19)

## Consequences

- Diff Block format gains an optional `at:` header alongside `file_path:`.
- Fuzzy matcher must resolve anchors; on resolution failure, returns `anchor_not_found` error with suggestions.
- Append-at-end still supported via empty SEARCH block with no `at:` header.
- LLM prompt must document the anchor grammar explicitly to avoid malformed anchors.
