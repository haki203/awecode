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

Three ways to use it, all sharing the same agent core:
- **TUI** — Direct Mode chat in your terminal (Ink/React)
- **GUI** — Electron desktop app (`awecode open gui`)
- **PWA** — mobile web app, QR-paired to your computer (`awecode open web`)

**Status:** v0.1 in active development. The orchestrator pipeline, workflow engine, repo map, context compaction, 3-panel TUI, Electron GUI, and mobile PWA are all implemented. Dogfooding in progress — expect rough edges.

---

## Why awecode?

Most CLI coding agents are **pure chat loops**. You ask for a feature, they emit a diff, you accept/reject. If the task is simple that's fine. If the task is "build me a CSV import feature with validation" they start coding before they understand the requirements.

Awecode's **Intent Declaration** layer watches the user's prompt and, for creative/build tasks, automatically invokes the `brainstorm` workflow to explore requirements, then `spec` to write a design doc, `grill` to stress-test it, and `plan` to write a detailed implementation plan — before any code is written.

Simple tasks ("fix this typo") skip the pipeline and run in **Direct Mode**. You don't opt in or out — the agent picks.

---

## Prerequisites

- **Node.js ≥ 20** (LTS recommended)
- **Yarn v4** (Berry) — auto-installed via the `packageManager` field in `package.json` when you run `yarn install`; you do NOT need to install Yarn globally first
- **Git** (for the worktree-based Diff Cycle)
- An LLM provider account (OpenAI, Anthropic, Google) **or** a local Ollama server

Optional, depending on which client you use:
- **Electron** (`awecode open gui`) — bundled as a devDependency; falls back to `ELECTRON_PATH`, `node_modules/electron`, or a global `electron`
- **A phone on the same Wi-Fi** (`awecode open web`) for the PWA mobile client

---

## Clone & setup

```bash
# 1. Clone the repo
git clone https://github.com/haki203/awecode.git
cd awecode

# 2. Install dependencies (Yarn v4 auto-bootstraps itself via corepack)
yarn install

# 3. Build all 11 workspace packages (tsup / electron-vite / vite)
yarn build

# 4. (optional) Sanity-check
yarn test        # ~40s, ~277 unit tests
yarn typecheck   # TS strict across workspaces
yarn lint        # eslint across workspaces
```

After building, the CLI binary lives at `packages/cli/dist/index.js`. You have three ways to run it during development:

```bash
# Option A — call the built entry directly (no install needed)
node packages/cli/dist/index.js --help

# Option B — link it globally so `awecode` works everywhere
cd packages/cli && yarn link
awecode --help

# Option C — from repo root, prefix every command
node packages/cli/dist/index.js <command>
```

> The examples below use the bare `awecode` form. If you haven't linked it, replace `awecode` with `node packages/cli/dist/index.js`.

---

## Add a model & API key

The first time you run awecode it needs to know which LLM provider to talk to and how to authenticate. Config is stored at `~/.config/awecode/config.yaml` (override with the `AWECODE_CONFIG_PATH` env var).

### Option 1 — interactive wizard (recommended)

```bash
awecode config
```

The wizard walks you through:

1. **Pick a provider** — OpenAI (GPT), Anthropic (Claude), Google (Gemini), Ollama (local), or any OpenAI-compatible endpoint.
2. **Pick a default model** — e.g. `gpt-4o-mini`, `claude-3-5-sonnet`, `gemini-1.5-flash`, `llama3`.
3. **Pick a key source**:
   - **Environment variable** (recommended) — writes `envKey: OPENAI_API_KEY` so the key is never stored in the YAML.
   - **Inline paste** — stores the key directly in `config.yaml`. Convenient but less safe.

You can re-run `awecode config` any time to switch providers or add more.

### Option 2 — edit the YAML directly

Create or edit `~/.config/awecode/config.yaml`:

```yaml
# ~/.config/awecode/config.yaml
activeProvider: openai        # which provider awecode uses by default

providers:
  openai:
    type: openai
    envKey: OPENAI_API_KEY    # reads process.env.OPENAI_API_KEY at load
    defaultModel: gpt-4o-mini

  anthropic:
    type: anthropic
    apiKey: sk-ant-...        # inline (less safe — prefer envKey)
    defaultModel: claude-3-5-sonnet

  gemini:
    type: google
    envKey: GOOGLE_GENERATIVE_AI_API_KEY
    defaultModel: gemini-1.5-flash

  local-ollama:
    type: ollama
    baseURL: http://localhost:11434
    defaultModel: llama3      # no API key needed

  openrouter:                 # any OpenAI-compatible endpoint
    type: openai-compatible
    baseURL: https://openrouter.ai/api/v1
    envKey: OPENROUTER_API_KEY
    defaultModel: anthropic/claude-3.5-sonnet
```

Supported `type` values: `openai`, `anthropic`, `google`, `ollama`, `openai-compatible`.

**API-key resolution order** (for each provider, first non-empty wins):
1. `envKey` — the env var named by `envKey`
2. `apiKey` — the inline value from the YAML
3. **Conventional defaults** — `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` are auto-detected when no `apiKey`/`envKey` is set

So the simplest possible setup is: set one env var and skip the YAML entirely.

```bash
# Linux / macOS
export OPENAI_API_KEY="sk-..."
# Windows PowerShell
$env:OPENAI_API_KEY = "sk-..."
```

### Smoke test

```bash
awecode chat-test
```

Sends `"Hello"` to the active provider and prints the reply + token count. Expected:

```
Sending "Hello" to openai...

Hi there! How can I help?

(tokens: 23)
```

If that works, the provider + key are correct.

---

## Run the CLI / TUI

The terminal UI is the **default** command — no subcommand needed. It is built with [Ink](https://github.com/vadimdemedes/ink) (React for terminals).

```bash
# Bare — open Direct Mode chat with an empty prompt
awecode

# Explicit
awecode chat

# Pass a prompt directly (simple task → runs in Direct Mode)
awecode "fix typo 'recieve' -> 'receive' in src/foo.ts"

# Override the model or provider for this session only (no config edit)
awecode --model gpt-4o "refactor the auth module"
awecode -m claude-3-5-sonnet --provider anthropic "write a migration"

# Quick reference
awecode --help
awecode --version
```

**Available CLI commands:**

| Command | What it does |
|---|---|
| *(none)* / `chat [prompt]` | Direct Mode chat TUI (default) |
| `open gui` | Launch the Electron desktop GUI |
| `open web` | Start the mobile PWA server (HTTPS + WebSocket, QR-paired) |
| `config` | Interactive LLM provider setup wizard |
| `chat-test` | Smoke test — send "hello" to the active provider |
| `worktree list` / `ls` | List active git worktrees |
| `worktree clean [<uuid>]` | Remove one worktree, or all stale (>24h) ones |
| `--help` / `-h` | Show help |
| `--version` / `-v` | Print version |

**CLI flags (only the default chat command):**

- `--model <name>` / `-m <name>` — override the active provider's model for this session
- `--provider <id>` / `-p <id>` — switch active provider by id (must exist in config)

**`open web` flags:**

- `--port <n>` / `-p <n>` — port (default `5174`)
- `--host <addr>` — bind address (default `0.0.0.0`)
- `--no-tls` / `--insecure` — skip HTTPS (not recommended; PWA features need HTTPS)
- `--mdns [name]` — advertise as `<name>.local` (default `awecode`) for easy access
- `--no-mdns` — disable mDNS

**In-chat slash commands:**

| Command | What it does |
|---|---|
| `/brainstorm` | Explore requirements, propose approaches |
| `/spec` | Write a design doc to `docs/specs/` |
| `/grill` | Stress-test the spec with batched questions |
| `/plan` | Write a detailed implementation plan |
| `/skip-workflow` | Force Direct Mode for this task |
| `/compact` (`/smol`, `/condense`) | Compact the context window |
| `/tokens` | Inspect token usage |
| `/checkpoint` | Snapshot current context |
| `/restore <id>` | Roll back to a checkpoint |
| `/context` / `/ctx` | Toggle the context overlay |

In Direct Mode, the agent streams a response. When it emits a Diff Block, the orchestrator kicks off a **Diff Cycle**:

1. **Parse** the diff block(s) from the LLM output
2. **Approve** each block (`y/n/e/s/a/q`)
3. **Worktree** — create an isolated git worktree
4. **Apply** the diff, run tests, **self-heal** if they fail
5. **Merge** back to your working branch
6. **Commit** with message prefix `awecode: <task-uuid>`
7. **Cleanup** the worktree

Each LLM diff response is one Diff Cycle. A long task produces many cycles, each owning its own worktree.

---

## Run the desktop GUI

```bash
awecode open gui
```

Launches the Electron desktop app (`packages/gui`). Electron is resolved in this order: `ELECTRON_PATH` env var → `node_modules/electron/dist/electron` → `.bin/electron` → global `electron`. The GUI wraps the same `runChatLoop` from `@awecode/agent` as the TUI, so all features (Diff Cycle, workflow engine, context tracking) are identical — only the presentation layer differs.

If Electron isn't found, install it and try again:

```bash
# Either set the path explicitly
$env:ELECTRON_PATH = "C:\path\to\electron.exe"   # Windows
export ELECTRON_PATH=/usr/local/bin/electron      # Linux/macOS

# Or let yarn resolve it
yarn install
```

For GUI development (hot-reload of renderer + main):

```bash
cd packages/gui
yarn dev        # electron-vite dev
```

---

## Run the PWA (mobile)

```bash
awecode open web
```

Boots a single Node HTTP(S)+WebSocket server that serves the same renderer as the desktop GUI, but as an installable PWA. The agent runs **in-process** on your computer; the phone is a thin client (see [ADR-0008](docs/adr/0008-mobile-client-pwa-not-native.md) for why we chose PWA over native).

On startup the terminal prints:

- A **QR code** — scan with your phone to open the UI (the URL embeds a bearer token, so no login step)
- Local / network / mDNS URLs
- The auth token (in case you want to paste the URL manually)

**First-time phone setup:**

1. Make sure the phone is on the **same Wi-Fi network** as the computer running `awecode open web`.
2. Scan the QR code (default camera app on iOS/Android both work).
3. The browser opens `https://<your-computer>.local:5174/?token=...`.
4. Accept the self-signed certificate warning once (certs are auto-generated via mkcert at `~/.awecode/certs/`).
5. **Add to Home Screen** — iOS: Share → Add to Home Screen. Android: Chrome menu → Install app. This makes it behave like a native app (icon, full-screen, offline shell).

**Common flags:**

```bash
# Custom port
awecode open web --port 8080

# Bind to localhost only (no phone access, but safer for testing)
awecode open web --host 127.0.0.1

# Custom mDNS name → reachable at https://mydev.local:5174
awecode open web --mdns mydev

# Disable mDNS
awecode open web --no-mdns

# Skip TLS (NOT recommended — PWA service workers require HTTPS)
awecode open web --no-tls
```

One server = one project (`cwd`). To work on a different repo, `cd` into it and run `awecode open web` again.

For PWA development (hot-reload of the renderer):

```bash
cd packages/web
yarn dev        # vite dev server
```

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

11 packages with strict dependency direction (leaf packages `llm`, `diff`, `tools` have no deps on higher packages):

| Package | Responsibility |
|---|---|
| `@awecode/cli` | Ink TUI + CLI entry (binary: `awecode`) |
| `@awecode/agent` | chat loop, context manager, protocol session, persistence |
| `@awecode/orchestrator` | wires chat loop to harness (Diff Cycle) |
| `@awecode/harness` | git worktree isolation + self-heal |
| `@awecode/diff` | anchor-based diff engine |
| `@awecode/llm` | Vercel AI SDK provider abstraction + config |
| `@awecode/tools` | file/glob tools |
| `@awecode/workflow` | workflow engine + built-in skills |
| `@awecode/repomap` | tree-sitter repo outline |
| `@awecode/gui` | Electron desktop app |
| `@awecode/web` | mobile PWA server |

See [docs/orchestrator.md](docs/orchestrator.md) for the Diff Cycle pipeline and [docs/adr/](docs/adr/) for the design decisions.

---

## Workflows

For creative/complex tasks, the agent auto-emits `start_workflow("brainstorm")` and runs the brainstorm → spec → grill → plan pipeline. Skip with `/skip-workflow` or invoke phases individually (see the slash-command table above).

See [docs/workflows.md](docs/workflows.md) for the full guide.

---

## Context transparency

The left panel of the TUI shows exactly what's in the agent's context: every file, every tool output, with token counts and who added them (you or the agent). At 85% of context budget it turns yellow (`MODERATE`); at 95% red (`SEVERE`). Type `/compact` to compact (alias `/smol`), `/tokens` to inspect, `/checkpoint` to snapshot, `/restore <id>` to roll back.

See [docs/compaction.md](docs/compaction.md) for details.

---

## Repo map

A tree-sitter-generated outline of the entire repo (symbol names + signatures, no bodies) is injected into context so the agent knows what exists without reading every file. v0.1 supports TypeScript, JavaScript, Python, Go, Rust. Cached at `.awecode/cache/repo-map.json`, keyed by git commit hash.

---

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for project layout, commit conventions, and how to add a new built-in Skill. Quick reference:

```bash
git clone https://github.com/haki203/awecode.git
cd awecode
yarn install
yarn build
yarn test
```

Per-package dev commands:

```bash
# TUI hot reload
cd packages/cli && yarn dev

# GUI hot reload (Electron)
cd packages/gui && yarn dev

# PWA renderer hot reload (Vite)
cd packages/web && yarn dev
```

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

Apache-2.0 — see [LICENSE](LICENSE). Contributions welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).
