# Getting Started

A end-to-end walk-through: clone → install → configure a model → run each client (CLI, TUI, GUI, PWA).

## Prerequisites

- **Node.js ≥ 20** (LTS recommended)
- **Git**
- **Yarn v4 (Berry)** — auto-installed via the `packageManager: yarn@4.5.0` field in `package.json` when you run `yarn install`. You do **not** need to install Yarn globally first; corepack (bundled with Node ≥ 16.10) bootstraps it.
- An LLM provider account (OpenAI / Anthropic / Google) **or** a local [Ollama](https://ollama.ai) server.

Optional, depending on which client you use:

- **Electron** for the desktop GUI — bundled as a devDependency.
- **A phone on the same Wi-Fi** for the PWA mobile client.

---

## 1. Clone & install

```bash
git clone https://github.com/haki203/awecode.git
cd awecode
yarn install
```

`yarn install` resolves all 11 workspace packages under `packages/*`.

## 2. Build

```bash
yarn build       # tsup / electron-vite / vite, topological order
```

The CLI binary is emitted at `packages/cli/dist/index.js`. During development you have three ways to invoke it:

```bash
# Direct (no install step)
node packages/cli/dist/index.js --help

# Link it globally, then use `awecode` everywhere
cd packages/cli && yarn link
awecode --help
```

The examples below use the bare `awecode` form. If you haven't linked it, replace `awecode` with `node packages/cli/dist/index.js`.

## 3. Run the test suite (optional sanity check)

```bash
yarn test        # ~40s, ~277 unit tests
yarn typecheck   # TS strict across workspaces
yarn lint        # eslint across workspaces
```

## 4. Configure an LLM provider & API key

Config lives at `~/.config/awecode/config.yaml`. Override the path with the `AWECODE_CONFIG_PATH` env var.

### Option A — interactive wizard (recommended)

```bash
awecode config
```

You'll be asked:

1. **Provider** — OpenAI / Anthropic / Google / Ollama / OpenAI-compatible.
2. **Default model** — e.g. `gpt-4o-mini`, `claude-3-5-sonnet`, `gemini-1.5-flash`, `llama3`.
3. **Key source**:
   - **Environment variable** (recommended) — the wizard writes `envKey: OPENAI_API_KEY`, so the key is never stored in the YAML.
   - **Inline paste** — stored in `config.yaml`. Convenient but less safe.

Re-run `awecode config` any time to add or switch providers.

### Option B — edit the YAML directly

```yaml
# ~/.config/awecode/config.yaml
activeProvider: openai

providers:
  openai:
    type: openai
    envKey: OPENAI_API_KEY
    defaultModel: gpt-4o-mini

  anthropic:
    type: anthropic
    envKey: ANTHROPIC_API_KEY
    defaultModel: claude-3-5-sonnet

  gemini:
    type: google
    envKey: GOOGLE_GENERATIVE_AI_API_KEY
    defaultModel: gemini-1.5-flash

  local-ollama:
    type: ollama
    baseURL: http://localhost:11434
    defaultModel: llama3

  openrouter:                 # any OpenAI-compatible endpoint
    type: openai-compatible
    baseURL: https://openrouter.ai/api/v1
    envKey: OPENROUTER_API_KEY
    defaultModel: anthropic/claude-3.5-sonnet
```

Supported `type` values: `openai`, `anthropic`, `google`, `ollama`, `openai-compatible`.

**API-key resolution order** (first non-empty wins):

1. `envKey` — the env var named by `envKey`
2. `apiKey` — the inline value from the YAML
3. **Conventional defaults** — `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` are auto-detected when no `apiKey`/`envKey` is set

So the absolute simplest setup is to set one env var and skip the YAML:

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

Sends `"Hello"` to the active provider. Expected output:

```
Sending "Hello" to openai...

Hi there! How can I help?

(tokens: 23)
```

If you see a reply, the provider + key are correct.

---

## 5. Run a client

All three clients share the same agent core (`@awecode/agent`), so features are identical — only the presentation differs.

### 5a. TUI (terminal UI) — the default

Built with [Ink](https://github.com/vadimdemedes/ink) (React for terminals).

```bash
awecode                                  # bare — empty prompt, Direct Mode
awecode chat                             # explicit
awecode "fix typo in src/foo.ts"         # pass a prompt as the first arg
awecode --model gpt-4o "refactor auth"   # override model for this session
awecode -m claude-3-5-sonnet \
  --provider anthropic "write migration" # switch provider too
```

Inside the TUI you can use slash commands:

| Slash | Action |
|---|---|
| `/brainstorm` `/spec` `/grill` `/plan` | run a workflow phase |
| `/skip-workflow` | force Direct Mode |
| `/compact` (`/smol`, `/condense`) | compact context |
| `/tokens` | inspect token usage |
| `/checkpoint` `/restore <id>` | snapshot / roll back context |
| `/context` (`/ctx`) | toggle context overlay |

Approval keys when a Diff Block is shown: `y` yes · `n` no · `e` edit · `s` skip · `a` accept-all · `q` quit.

### 5b. Desktop GUI (Electron)

```bash
awecode open gui
```

Electron is resolved in this order: `ELECTRON_PATH` env var → `node_modules/electron/dist/electron` → `.bin/electron` → global `electron`. If none is found, install Electron and re-run.

For development (hot-reload of main + renderer):

```bash
cd packages/gui
yarn dev        # electron-vite dev
```

### 5c. PWA (mobile, QR-paired)

```bash
awecode open web
```

Boots a single Node HTTP(S)+WebSocket server. The agent runs **in-process** on your computer; the phone is a thin client. On startup the terminal prints a **QR code** (embedding the bearer token), plus local / network / mDNS URLs.

**First-time phone setup:**

1. Make sure the phone is on the **same Wi-Fi** as the computer.
2. Scan the QR code with the phone's camera.
3. Accept the self-signed cert warning once (certs auto-generated via mkcert at `~/.awecode/certs/`).
4. **Add to Home Screen** to install as a PWA (iOS: Share → Add to Home Screen; Android: Chrome menu → Install app).

**Flags:**

```bash
awecode open web --port 8080                 # custom port (default 5174)
awecode open web --host 127.0.0.1            # localhost only (no phone)
awecode open web --mdns mydev                # → https://mydev.local:5174
awecode open web --no-mdns                   # disable mDNS
awecode open web --no-tls                    # NOT recommended (PWA needs HTTPS)
```

One server = one project (`cwd`). To work on a different repo, `cd` into it and run `awecode open web` again.

For renderer development:

```bash
cd packages/web
yarn dev        # vite dev server
```

See [ADR-0008](adr/0008-mobile-client-pwa-not-native.md) for why we chose PWA over a native app.

---

## 6. Other CLI commands

```bash
awecode --help                  # full command reference
awecode --version
awecode worktree list           # list active git worktrees
awecode worktree clean [<uuid>] # remove one, or all stale (>24h)
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `command not found: awecode` | Run `cd packages/cli && yarn link`, or use `node packages/cli/dist/index.js` |
| `Yarn is not installed` | Node ≥ 16.10 ships corepack; run `corepack enable` |
| chat-test fails with auth error | Verify the env var is set in the shell you run `awecode` from; or re-run `awecode config` |
| `open gui` can't find Electron | Set `ELECTRON_PATH`, or `yarn install` to pull the devDependency |
| PWA won't load on phone | Same Wi-Fi? Firewall blocking port 5174? Try `--mdns` URL; accept the cert warning |
| Self-signed cert keeps warning | The cert at `~/.awecode/certs/` is auto-generated; install the CA once for a clean experience |

## Next steps

- [Direct Mode guide](direct-mode.md)
- [Workflow engine](workflows.md)
- [Harness (worktree, self-heal)](harness.md)
- [Orchestrator (Diff Cycle pipeline)](orchestrator.md)
- [Architecture Decision Records](adr/)
