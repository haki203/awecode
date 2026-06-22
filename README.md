# Awecode

<!-- TODO: demo GIF — record a short TUI session (Direct Mode + a Diff Cycle) and embed here as `docs/assets/awecode-demo.gif` -->

[![CI](https://github.com/haki203/awecode/actions/workflows/ci.yml/badge.svg)](https://github.com/haki203/awecode/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)
[![TypeScript](https://img.shields.io/badge/typescript-strict-blue)](tsconfig.base.json)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](CONTRIBUTING.md)

A CLI coding agent that combines:

- **Aider-style** search/replace diff blocks with anchor-based positioning
- **Plandex-style** git worktree isolation + self-healing loop
- **Cline-style** explicit context tracking with token budget bar
- **A built-in workflow engine** (`brainstorm → spec → grill → plan`) that auto-triggers for complex tasks — the USP vs. plain chat-loop agents

**Status:** v0.1 in active development. The orchestrator pipeline, workflow engine, repo map, context compaction, and 3-panel TUI are all implemented. Dogfooding in progress — expect rough edges.

---

## Why awecode?

Most CLI coding agents are **pure chat loops**. You ask for a feature, they emit a diff, you accept/reject. If the task is simple that's fine. If the task is "build me a CSV import feature with validation" they start coding before they understand the requirements.

Awecode's **Intent Declaration** layer watches the user's prompt and, for creative/build tasks, automatically invokes the `brainstorm` workflow to explore requirements, then `spec` to write a design doc, `grill` to stress-test it, and `plan` to write a detailed implementation plan — before any code is written.

Simple tasks ("fix this typo") skip the pipeline and run in **Direct Mode**. You don't opt in or out — the agent picks.

---

## Quick start

```bash
# Install (once published)
npm install -g @awecode/cli

# First run: configure your LLM provider
awecode config

# Smoke test (sends "Hello" to your configured provider)
awecode chat-test

# Enter Direct Mode TUI (no args), or pass a prompt directly
awecode
awecode "fix typo 'recieve' -> 'receive' in src/foo.ts"

# Override the model or provider at runtime (no config edit needed)
awecode --model gpt-4o "refactor the auth module"
awecode -m claude-3-5-sonnet --provider anthropic "write a migration"
```

### Keeping API keys out of dotfiles

Instead of pasting your API key into `~/.config/awecode/config.yaml`,
reference an environment variable:

```yaml
# ~/.config/awecode/config.yaml
activeProvider: openai
providers:
  openai:
    type: openai
    envKey: OPENAI_API_KEY        # reads process.env.OPENAI_API_KEY at load
    defaultModel: gpt-4o-mini
```

Or skip the YAML entirely — awecode auto-detects conventional env vars
(`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`)
when no `apiKey`/`envKey` is set. The wizard's "Environment variable"
option sets this up for you.

In Direct Mode, the agent streams a response. When it emits a Diff Block, the
orchestrator kicks off a **Diff Cycle**:

1. **Parse** the diff block(s) from the LLM output
2. **Approve** each block (`y/n/e/s/a/q`)
3. **Worktree** — create an isolated git worktree
4. **Apply** the diff, run tests, **self-heal** if they fail
5. **Merge** back to your working branch
6. **Commit** with message prefix `awecode: <task-uuid>`
7. **Cleanup** the worktree

Each LLM diff response is one Diff Cycle. A long task produces many cycles,
each owning its own worktree.

---

## Mobile access (PWA)

Run `awecode open web` on your computer. The terminal prints a QR code; scan it with your phone to open the web UI (URL includes a bearer token). Add to your home screen to install as a PWA.

The phone must be on the same network as the computer. The agent keeps running on the computer — the phone is a thin client.

See [docs/adr/0008-mobile-client-pwa-not-native.md](docs/adr/0008-mobile-client-pwa-not-native.md) for why we chose PWA over a native app.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CLI (Ink TUI)                              │
│        packages/cli — React components, input, view           │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                       Agent Core                              │
│  packages/agent — chat loop, context manager, intent detect   │
└─────┬──────────────┬───────────────┬────────────┬───────────┘
      │              │               │            │
      ▼              ▼               ▼            ▼
┌──────────┐  ┌────────────┐  ┌──────────┐  ┌──────────────┐
│ Diff     │  │ Harness    │  │ Tools    │  │ Workflow     │
│ Engine   │  │ (git wt)   │  │          │  │ Engine       │
└──────────┘  └────────────┘  └──────────┘  └──────┬───────┘
                                                   ▼
                                          ┌────────────────┐
                                          │ Built-in Skills│
                                          │ brainstorm     │
                                          │ spec, grill    │
                                          │ plan           │
                                          └────────────────┘

                           ┌──────────────────────┐
                           │  Orchestrator        │
                           │  (Plan 6)            │
                           │  Wires chat ↔ harness│
                           └──────────────────────┘
```

9 packages with strict dependency direction (leaf packages `llm`, `diff`,
`tools` have no deps on higher packages). See [ARCHITECTURE.md](docs/architecture.md)
(if present) or the [orchestrator doc](docs/orchestrator.md) for details.

---

## Workflows

For creative/complex tasks, the agent auto-emits `start_workflow("brainstorm")`
and runs the brainstorm → spec → grill → plan pipeline. Skip with
`/skip-workflow` or invoke phases individually:

| Command          | What it does                                    |
|------------------|-------------------------------------------------|
| `/brainstorm`    | Explore requirements, propose approaches        |
| `/spec`          | Write a design doc to `docs/specs/`             |
| `/grill`         | Stress-test the spec with batched questions     |
| `/plan`          | Write a detailed implementation plan            |
| `/skip-workflow` | Force Direct Mode for this task                 |

See [docs/workflows.md](docs/workflows.md) for the full guide.

---

## Context transparency

The left panel of the TUI shows exactly what's in the agent's context: every
file, every tool output, with token counts and who added them (you or the
agent). At 85% of context budget it turns yellow (`MODERATE`); at 95% red
(`SEVERE`). Type `/smol` to compact, `/tokens` to inspect,
`/checkpoint` to snapshot, `/restore <id>` to roll back.

See [docs/compaction.md](docs/compaction.md) for details.

---

## Repo map

A tree-sitter-generated outline of the entire repo (symbol names + signatures,
no bodies) is injected into context so the agent knows what exists without
reading every file. v0.1 supports TypeScript, JavaScript, Python, Go, Rust.
Cached at `.awecode/cache/repo-map.json`, keyed by git commit hash.

---

## Development

```bash
git clone https://github.com/haki203/awecode.git
cd awecode
yarn install
yarn build
yarn test       # ~40s, 277 tests
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for project layout, commit conventions,
and how to add a new built-in Skill.

## Documentation

- [Getting started](docs/getting-started.md)
- [Direct Mode guide](docs/direct-mode.md)
- [Workflow engine](docs/workflows.md)
- [Harness (worktree, self-heal, sandbox)](docs/harness.md)
- [Repo Map](docs/repomap.md)
- [Context compaction](docs/compaction.md)
- [Orchestrator (Diff Cycle pipeline)](docs/orchestrator.md)
- [Architecture Decision Records](docs/adr/)

## License

Apache-2.0 — see [LICENSE](LICENSE). Contributions welcome; see
[CONTRIBUTING.md](CONTRIBUTING.md).
