# Direct Mode

Direct Mode is awecode's default state — the agent responds to user prompts
directly, without routing through the workflow pipeline (brainstorm → spec →
grill → plan). It is the mode you enter when you run `awecode` with no command,
with an explicit `chat` command, or with any unknown token treated as the first
prompt.

Typical uses:

- Typo fixes
- Single-file edits
- Factual queries
- Code reading / exploration

## Entering Direct Mode

```bash
awecode                                 # bare TUI, prompt for input
awecode chat                            # same, explicit form
awecode "fix typo 'recieve' in foo.ts"  # any unknown token = first prompt
```

The last form is the common `awecode fix the bug in foo.ts` UX: the CLI
detects unknown tokens and treats `argv` as the initial user prompt rather than
erroring out.

## Layout

Direct Mode renders a 2-panel TUI:

```
┌─ Context ──────────┐┌─ Chat ─────────────────────┐
│ budget: 32k / 200k ││ You: fix typo 'recieve'... │
│                    ││ Agent: reading foo.ts...   │
│ file: src/foo.ts   ││   (streaming response)     │
│   1.2k tokens      ││                            │
│                    ││ > _                         │
└────────────────────┘└────────────────────────────┘
```

- **Left panel (40%)** — Context Manager snapshot: tracked files, token usage,
  budget. Updated as the agent reads files and diffs are applied.
- **Right panel (60%)** — Chat transcript with user / agent / tool messages,
  a streaming indicator while the agent thinks, and the prompt input.

## Approval Mode

When the agent emits a Diff Block during streaming, the block is queued and
surfaced as an Approval Mode overlay once streaming completes (non-blocking
queue, FIFO — diffs produced mid-stream are reviewed after, not interleaved
with tokens).

For each Diff Block the overlay shows:

- Target file path and current block index (`block 2 of 4`)
- A rendered diff preview
- Four actions:

| Key | Action | Behavior |
|-----|--------|----------|
| `y` | accept | Apply block to disk, refresh Context Manager |
| `n` | reject | Discard block, do not apply |
| `e` | edit   | Open diff in `$EDITOR` (manual refinement) |
| `s` | skip   | Skip this block, continue to next |

Multiple blocks (from one or more queued diffs) are reviewed sequentially.
After the last block is resolved the overlay closes and the chat prompt
returns.

If a block fails to apply (fuzzy match miss, anchor resolution failure), the
error is surfaced as a `[tool]` line in the chat transcript so the user can
see why an accepted diff did not land.

## When to use Direct Mode vs Workflow?

| Task | Mode |
|------|------|
| "Fix typo in X" | Direct |
| "Add test for function Y" | Direct or light workflow |
| "Build CSV import feature" | Workflow (brainstorm → ...) |
| "Refactor auth module to OAuth" | Workflow |

Rule of thumb: if the task is a single intent that fits in one turn with at
most a couple of file edits, Direct Mode is the right tool. If it needs
specification, design pressure-testing, or a multi-step plan, use the workflow
engine (`/brainstorm`, `/spec`, `/grill`, `/plan`).

## Exiting

`Ctrl+C` exits Direct Mode.
