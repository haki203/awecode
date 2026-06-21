# Awecode Web — Mobile PWA Design

**Date:** 2026-06-21
**Status:** Approved after grilling (41 decisions, see `grill-log.md`)
**ADRs:** [0007 — Extract ProtocolSession](../../adr/0007-extract-protocol-session.md), [0008 — Mobile client: PWA, not native](../../adr/0008-mobile-client-pwa-not-native.md)

## Goal

Bring the awecode agent to mobile phones by packaging the existing Desktop React renderer as a PWA served from a small HTTP/WebSocket server embedded in the CLI. The phone is a thin client; the agent keeps running on the developer's computer over LAN.

## Constraints (user-accepted)

- The computer must stay powered on and connected to the network throughout the session.
- The phone connects over LAN (same Wi-Fi typically).
- One server process = one project (`cwd`). Multi-project work means multiple `awecode open web` invocations on different ports.
- Local `Notification` API only — no VAPID Web Push for v0.1.
- iOS is supported but Android is the reference platform (richer PWA support).

## Non-goals

- Multi-user hosting, rate limiting, quotas.
- App Store / Play Store distribution for v0.1 (PWA only; future Capacitor wrap is possible without rewrite).
- Editing code on the phone (agent edits files on the computer).
- Resuming past conversations by continuing to chat (sidebar shows read-only transcript only).
- Web Push (VAPID) background delivery.
- Theme switching (dark only, matching Desktop).

---

## Architecture

### High-level data flow

```
┌────────────── Phone (browser/PWA) ──────────────┐
│  React renderer (@awecode/web/renderer)         │
│  imports components from @awecode/gui directly  │
│      ↕ WebSocket /agent   +  REST /api/sessions │
│      (transport/client.ts, auto-reconnect)      │
└──────────────────────────┬──────────────────────┘
                           │ HTTPS (mkcert)
                           │ Bearer token (Authorization or ?token=)
                           │ wss://awecode.local:5174/agent?token=XXX
                           │   or https://192.168.1.42:5174/...
┌──────────────────────────▼──────────────────────┐
│  Computer: `awecode open web`                   │
│  ┌────────────────────────────────────────────┐ │
│  │ 1 Node process (@awecode/web/server)       │ │
│  │  ├─ HTTPS server (mkcert)                  │ │
│  │  │   ├─ GET / → serve PWA static           │ │
│  │  │   ├─ REST /api/sessions/*               │ │
│  │  │   └─ Service Worker /sw.js              │ │
│  │  ├─ WebSocketServer /agent                 │ │
│  │  │   └─ per connection:                    │ │
│  │  │       ProtocolSession (from @awecode/   │ │
│  │  │       agent) ← also used by Desktop CLI │ │
│  │  │       internal mode                     │ │
│  │  ├─ applyEvent() to persist each event     │ │
│  │  │   into Session JSON (shared w/ Desktop) │ │
│  │  ├─ mDNS advertiser (opt-in)               │ │
│  │  └─ QR printer                             │ │
│  └────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Layer separation

| Layer | Source | Reused? |
|---|---|---|
| Core agent loop | `@awecode/agent` `runChatLoop`, `ContextManager`, `ApprovalQueue`, `Orchestrator` | 100%, no edits beyond adding `onDone` callback |
| **ProtocolSession** (NEW) | `@awecode/agent/src/protocol-session.ts` | NEW — extracted from `packages/cli/src/commands/gui.ts`. Wraps `runChatLoop` with event-sink + state. See [ADR-0007](../../adr/0007-extract-protocol-session.md). |
| Persistence | `@awecode/agent/src/persistence/` (`sessions.ts`, `session-event-handler.ts`, `checkpoint.ts`) | `sessions.ts` moved from `@awecode/gui/src/main/`; `session-event-handler.ts` extracted from `AgentBridge.handle`. Shared by Desktop and Web. |
| Wire protocol | `@awecode/gui/shared/protocol.ts` | Reused **verbatim**. No Web-specific extension. |
| Transport | `@awecode/web/src/server/ws-bridge.ts` (server) + `@awecode/web/src/renderer/src/transport/client.ts` (client) | NEW (~30 lines server glue + ~80 lines client with reconnect) |
| Presentation | `@awecode/gui/src/renderer/src/components/*` | **Imported directly**, not copied. Cross-package TypeScript + Vite workspace imports. Sidebar wrapped in a `SidebarDrawer` adapter component. |
| Server | `@awecode/web/src/server/*` | NEW (HTTP + WebSocket in-process, no child spawn) |

### Key architectural decisions

1. **In-process agent.** `runChatLoop` is invoked directly inside the Node HTTP server process (via `ProtocolSession`), not spawned as a child. Simpler, less overhead, easier debugging. Trade-off: an agent crash takes the server down (recoverable by restart + page refresh). See [ADR-0007](../../adr/0007-extract-protocol-session.md).
2. **No Electron dependency.** `@awecode/web` depends on `@awecode/agent`, `@awecode/llm`, `@awecode/orchestrator`, `@awecode/gui` (for shared protocol types + renderer components). It does **not** depend on `electron`.
3. **ProtocolSession extraction.** Both Desktop CLI `--internal` mode and Web `ws-bridge` instantiate `ProtocolSession`. TUI (`chat.tsx`) keeps calling `runChatLoop` directly because Ink is a UI runtime, not a wire transport. See [ADR-0007](../../adr/0007-extract-protocol-session.md).
4. **Shared persistence.** `applyEvent(session, ev)` is a pure function shared by Desktop's `AgentBridge` and Web's `ws-bridge`. Both clients write transcripts identically; no risk of one dropping a field.
5. **Bearer token + QR.** Single random 12-hex-char token generated at server start. Printed in the terminal both as text and as a QR code that encodes the full URL with the token as a query string. The phone scans the QR; the client strips the token from the URL after saving to `localStorage`.
6. **HTTPS via mkcert, user-installed.** Required for service worker + push on non-localhost. Server NEVER calls `mkcert -install` itself; on first run without certs it prints instructions and exits. User runs `mkcert -install` once, restarts.
7. **mDNS opt-in.** `awecode open web --mdns [--mdns-name awecode]`. Default off to avoid hostname conflicts when running multiple servers. Failure is non-fatal.
8. **Full PWA.** Manifest + service worker + offline app-shell cache + (Android) local notifications + haptics.
9. **No approval flow for v0.1.** Today `ApprovalQueue` only handles Diff Blocks (and the current TUI/GUI both handle approval via the Orchestrator's readline path, not via `GuiAgentEvent`). Adding real interactive approval is a separate feature that would extend `@awecode/agent` first, then reach both Desktop and Web. Out of scope.
10. **Single-project server.** No multi-project UI in Web. The server binds one `cwd`; switching projects means starting a second server on another port.

---

## Refactor of existing packages

This spec touches three existing packages. All refactors are non-breaking at runtime; tests may need import-path updates only.

### `@awecode/agent`

New files:

```
packages/agent/src/
├── protocol-session.ts                  # NEW — ProtocolSession class
└── persistence/                          # NEW folder
    ├── sessions.ts                       # MOVED from packages/gui/src/main/sessions.ts
    ├── session-event-handler.ts          # NEW — applyEvent(session, ev) pure function
    └── checkpoint.ts                     # MOVED from packages/agent/src/context/checkpoint.ts
```

`packages/agent/src/index.ts` exports:
- `ProtocolSession` (new)
- `persistence` namespace: `{ saveSession, loadSession, listSessions, listSessionsInWorkspace, deleteSession, renameSession, deriveTitle, DEFAULT_TITLE, applyEvent, saveCheckpoint, loadCheckpoint, listCheckpoints }`

`packages/agent/src/chat.ts`:
- Add `onDone?: () => void` to `ChatLoopOptions`. Called in a `finally` block inside `runChatLoop`. Replaces the caller-side try/finally wrap. Fixes the potential double-`done` risk in one place for all callers.

### `@awecode/gui`

- **`packages/gui/src/main/sessions.ts`** → re-export from `@awecode/agent`. File becomes a 1-line re-export so existing desktop imports keep working:
  ```ts
  export * from '@awecode/agent/persistence/sessions';
  ```
- **`packages/gui/src/main/types.ts`** (new): receives `WorkspaceState` moved out of `shared/protocol.ts`. Desktop-only type. Update imports in `packages/gui/src/main/index.ts` and `Sidebar.tsx`.
- **`packages/gui/src/shared/protocol.ts`**: keeps wire-level types only (`GuiAgentEvent`, `GuiClientCommand`, `SessionMeta`, `Session`, `ContextEntrySnapshot`). Removes `WorkspaceState`.
- **`packages/gui/src/main/index.ts`** (`AgentBridge.handle`): replace ~60 lines of event-folding logic with a call to `applyEvent(this.session, ev)` from `@awecode/agent`. `AgentBridge` shrinks.
- **`packages/gui/src/renderer/src/components/Markdown.tsx`**: add a `Copy` button to every code block via a custom `pre` renderer. Uses `navigator.clipboard.writeText` (works in both Electron Chromium and Web browsers). Shared improvement — Desktop benefits too.
- **`packages/gui/src/renderer/src/components/ContextPanel.tsx`**: replace nerd-font glyphs (`󰈙`, `🗺`, …) with Unicode emoji (`📄`, `🗺`, `✂`, `ƒ`, `▸`, `Δ`) and add a `font-family: 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif` fallback on `.glyph`. Mobile renders correctly; Desktop still works.
- **`packages/gui/src/renderer/src/components/Sidebar.tsx`**: replace its internal `useEffect` fetch with a call to a new shared `useSessions` hook (see below). Drop direct `window.awecode.listSessions()` calls from the component.
- **`packages/gui/src/renderer/src/hooks/useSessions.ts`** (new): shared hook. Owns `list`, `activeId`, `refresh`, `open`, `remove`, `rename`. Polls every 30 s while `document.hidden === false` (uses `visibilitychange` listener). Both Desktop and Web import this hook from `@awecode/gui`.
- **`packages/gui/src/renderer/src/hooks/useWorkspace.ts`** (new): Desktop-only hook for multi-project state. Web does not import this.
- **`packages/gui/src/renderer/src/components/Sidebar.tsx`**: split into two wrappers:
  - `Sidebar` (shared, layout only) — receives `sessions`, `activeId`, callbacks as props. Used directly by Web.
  - `WorkspaceSidebar` (Desktop-only) — wraps `Sidebar` and adds the multi-project header (`Open project`, `current-project`, `Recent projects` list). Imports `useWorkspace`.
- **`packages/gui/src/renderer/src/components/ErrorBoundary.tsx`** (new): React error boundary wrapping the app. Shows fallback UI on render crash. Shared between Desktop and Web.
- **`packages/gui/src/renderer/src/hooks/useAgent.ts`**: export the `ChatMessage` type so Web can import it instead of re-declaring.

### `@awecode/cli`

- **`packages/cli/src/commands/gui.ts`**: `runInternalProtocolServer` shrinks to a ~30-line stdio transport:
  - Bind `ProtocolSession.send` → `process.stdout.write(JSON.stringify(ev) + '\n')`.
  - Read stdin lines, dispatch to `session.handlePrompt(text)` / `session.abort()` / `session.dispose()`.
  - All agent logic moves into `ProtocolSession`.
- **`packages/cli/src/commands/web.ts`** (new): `openWebCommand(args)`. Parses `--port`, `--host`, `--no-tls`, `--mdns`, `--mdns-name`. Calls `startServer(...)` from `@awecode/web`. Registers with the CLI dispatcher alongside `gui`.
- **`packages/cli/src/index.ts`**: add `web` to the command switch.

---

## Package structure of `@awecode/web`

```
packages/web/
├── package.json
├── tsconfig.json
├── tsconfig.node.json               # server side
├── tsconfig.web.json                # renderer side
├── vite.config.ts                   # @vitejs/plugin-react + VitePWA + dev proxy
├── src/
│   ├── index.ts                     # public export: startServer()
│   ├── server/
│   │   ├── index.ts                 # startServer({ port, host, cwd, tls, mdns })
│   │   ├── http-server.ts           # node:http router, no Express
│   │   ├── ws-bridge.ts             # WebSocketServer /agent ↔ ProtocolSession
│   │   ├── auth.ts                  # bearer token generate/verify (constant-time)
│   │   ├── qr.ts                    # qrcode lib → ASCII to stdout + LAN IP discovery
│   │   ├── tls.ts                   # mkcert cert loader, never auto-installs CA
│   │   └── mdns.ts                  # bonjour-service advertiser, opt-in
│   └── renderer/
│       ├── index.html
│       ├── icons/                   # PWA icons (generated from one SVG)
│       └── src/
│           ├── main.tsx
│           ├── App.tsx              # shell + drawer + notification wiring
│           ├── globals.d.ts
│           ├── transport/
│           │   └── client.ts        # WebSocket client with exponential backoff
│           ├── hooks/
│           │   ├── useAgent.ts      # transport-agnostic; uses apiClient
│           │   └── useNotifications.ts # Notification API wrapper, gated by standalone mode
│           ├── components/
│           │   ├── SidebarDrawer.tsx # NEW — wraps shared Sidebar with mobile drawer
│           │   ├── MenuToggle.tsx    # NEW — hamburger button
│           │   ├── TranscriptView.tsx# NEW — renders past session read-only via <ChatView>
│           │   └── PwaInstallPrompt.tsx # NEW — shows "Add to Home Screen" hint
│           ├── sw/
│           │   └── register.ts      # SW registration (autoUpdate + cache cleanup)
│           └── styles.css           # imports from @awecode/gui/renderer + mobile overrides
├── scripts/
│   └── smoke-web.mjs                # standalone HTTP+WS smoke test
└── tests/
    ├── server/
    │   ├── auth.test.ts
    │   ├── http-server.test.ts
    │   └── ws-bridge.test.ts         # injects mock runChatLoop via ProtocolSessionOptions
    └── renderer/
        └── transport.test.ts
```

**Imports from `@awecode/gui`** (cross-package, not copy):
- `packages/gui/src/shared/protocol.ts` — wire types
- `packages/gui/src/renderer/src/components/{ChatView, Sidebar, PromptInput, StatusBar, ContextPanel, WorkflowIndicator, Markdown, ErrorBoundary}.tsx`
- `packages/gui/src/renderer/src/hooks/{useSessions, useAgent}.ts`
- `packages/gui/src/renderer/src/styles.css` (via `@import`)

**Why not copy**: bug fixes apply once; behavior stays consistent; no dead code path. Vite resolves cross-package TypeScript imports at dev time; the production bundle includes shared components once.

---

## Wire protocol

**Reused verbatim from `@awecode/gui/shared/protocol.ts`**. Web does **not** extend it.

```ts
export type GuiAgentEvent =
  | { type: 'ready'; cwd: string; model?: string; provider?: string }
  | { type: 'message'; role: 'user' | 'assistant' | 'tool'; content: string }
  | { type: 'token'; chunk: string }
  | { type: 'tool_call'; name: string }
  | { type: 'diff_detected'; diff: string }
  | { type: 'intent'; intent: 'workflow' | 'direct'; name?: string | null }
  | { type: 'context_snapshot'; entries: ContextEntrySnapshot[]; totalTokens: number; budgetTokens: number }
  | { type: 'error'; message: string }
  | { type: 'done' };

export type GuiClientCommand =
  | { type: 'prompt'; text: string }
  | { type: 'abort' }
  | { type: 'exit' };
```

`packages/web/src/shared/protocol.ts` — **does not exist**. Web imports directly from `@awecode/gui/shared/protocol`.

### Transport mapping

| Desktop (Electron) | Web |
|---|---|
| `ipcRenderer.invoke('agent:send', cmd)` | `ws.send(JSON.stringify(cmd))` |
| `ipcRenderer.on('agent:event', cb)` | `ws.onmessage = (e) => cb(JSON.parse(e.data))` |
| `ipcRenderer.invoke('session:list')` | `fetch('/api/sessions', { headers: { Authorization } })` |
| `ipcRenderer.invoke('session:new')` | Client-only state + `POST /api/sessions` on first message |
| `ipcRenderer.invoke('session:open', id)` | `GET /api/sessions/:id` |
| `ipcRenderer.invoke('session:delete', id)` | `DELETE /api/sessions/:id` |
| `ipcRenderer.invoke('session:rename', id, title)` | `PATCH /api/sessions/:id { title }` |
| `ipcRenderer.invoke('session:current')` | Client-only state (localStorage) |
| `ipcRenderer.invoke('workspace:*')` | **Not used** — Web is single-project |

### REST endpoints

| Endpoint | Method | Auth | Response |
|---|---|---|---|
| `/` | GET | none | `index.html` (PWA shell) |
| `/sw.js` | GET | none | Service worker source |
| `/manifest.webmanifest` | GET | none | Web App Manifest |
| `/assets/*` | GET | none | Hashed static asset, `Cache-Control: public, max-age=31536000, immutable` |
| `/api/sessions` | GET | Bearer | `SessionMeta[]` filtered by server's `cwd` |
| `/api/sessions/:id` | GET | Bearer | `Session` or 404 |
| `/api/sessions/:id` | DELETE | Bearer | `{ ok: true }` |
| `/api/sessions/:id` | PATCH | Bearer | `SessionMeta` (rename) |
| `/agent` | WS upgrade | Bearer via `?token=` query (browsers cannot set WS headers) | WebSocket stream |

- All 4xx/5xx return `{ error: string }` JSON.
- Auth failures return 401 with `{ error: 'invalid token' }`.
- SPA fallback: any non-API, non-asset, non-`/sw.js` path serves `index.html` with `Cache-Control: no-cache`.

### WebSocket framing

- One JSON object per UTF-8 text frame. No binary frames.
- Server → Client: any `GuiAgentEvent`.
- Client → Server: any `GuiClientCommand`.
- **No heartbeat.** Auto-reconnect on the client handles transient drops; iOS Safari idle drops recover within the 500 ms–5 s backoff window.
- `verifyClient` runs a constant-time compare of the `?token=` query value against the server's generated token.

---

## Component-level design

### Server components

#### `server/index.ts` — `startServer(opts)`

```ts
interface ServerOptions {
  port: number;        // default 5174
  host: string;        // default '0.0.0.0' for LAN access
  cwd: string;         // project root; binds session filtering
  tls: boolean;        // default true
  mdns?: { name: string } | null;  // default null (off)
}
```

Sequence:
1. Generate bearer token (`crypto.randomBytes(6).toString('hex')`).
2. Load config via `loadConfig` from `@awecode/llm`. If missing, print "Run `awecode config` first" and exit non-zero.
3. Create `ContextManager` (with resolved context window from active provider).
4. Create HTTPS server via `tls.ts` (looks for mkcert certs in `~/.awecode/certs/`). If certs missing, print "Run `mkcert -install` then restart" and exit non-zero. With `--no-tls`, fall back to plain HTTP and log warning that service worker will not register on non-localhost origins.
5. Mount REST routes + static via `http-server.ts`.
6. Attach WebSocket server via `ws-bridge.ts`.
7. If `mdns` requested, start `mdns.ts` advertiser (3 s timeout, non-fatal).
8. Print QR + URLs + token via `qr.ts`.
9. Register `SIGINT` / `SIGTERM` handlers: close HTTP server, abort all active `ProtocolSession`s, close all WS connections. Sessions are already saved on each event; no data loss.
10. Return `{ url, localUrl, networkUrls, token, close }` for testability.

#### `server/ws-bridge.ts` — `attachWsServer(server, ctx)`

```ts
interface WsCtx {
  config: AwecodeConfig;
  context: ContextManager;
  cwd: string;
  token: string;
}
```

`verifyClient({ req })`:
- Extract token from `Authorization: Bearer <token>` header OR `?token=` query (browser WS cannot set headers).
- Constant-time compare via `auth.verifyBearer`.

`wss.on('connection', (ws) => { ... })` — the entire connection handler is ~30 lines:

```ts
wss.on('connection', (ws) => {
  // Create a fresh ProtocolSession per connection. The session owns
  // liveMessages, abortController, lazy Orchestrator, and event emission.
  const session = createProtocolSession({
    config: ctx.config,
    context: ctx.context,   // shared ContextManager (read-only across connections)
    cwd: ctx.cwd,
    send: (ev) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(ev)),
  });

  // Persist every emitted event into the shared Session store.
  // applyEvent is the same pure function Desktop's AgentBridge uses.
  const sessionRecord: Session = {
    id: randomUUID(),
    title: DEFAULT_TITLE,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    cwd: ctx.cwd,
    messages: [],
  };
  saveSession(sessionRecord);
  session.onEvent((ev) => applyEvent(sessionRecord, ev));

  ws.on('message', (raw) => {
    let cmd: GuiClientCommand;
    try { cmd = JSON.parse(raw.toString()); }
    catch { session.send({ type: 'error', message: 'invalid JSON' }); return; }
    if (cmd.type === 'prompt') void session.handlePrompt(cmd.text);
    else if (cmd.type === 'abort') session.abort();
    else if (cmd.type === 'exit') ws.close();
  });

  ws.on('close', () => session.dispose());
});
```

`ProtocolSession` (see [ADR-0007](../../adr/0007-extract-protocol-session.md)) does all the heavy lifting. The transport adapter is deliberately thin.

#### `server/http-server.ts`

Pure `node:http` router (no Express):

```ts
async function route(req, res): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://x');
  const path = url.pathname;

  // PWA shell (public)
  if (path === '/' || path === '/index.html') return serveIndex(req, res);
  if (path === '/manifest.webmanifest') return serveManifest(req, res);
  if (path === '/sw.js') return serveSW(req, res);
  if (path.startsWith('/assets/')) return serveAsset(req, res, path);

  // API (authenticated)
  if (path.startsWith('/api/')) {
    if (!auth.verifyBearer(req, ctx.token)) return send401(res);
    if (path === '/api/sessions' && req.method === 'GET')
      return json(res, listSessionsInWorkspace(ctx.cwd));
    const m = path.match(/^\/api\/sessions\/([^/]+)$/);
    if (m) {
      const id = decodeURIComponent(m[1]!);
      if (req.method === 'GET') return json(res, loadSession(id) ?? send404(res));
      if (req.method === 'DELETE') { deleteSession(id); return json(res, { ok: true }); }
      if (req.method === 'PATCH') return renameSessionRoute(req, res, id);
    }
    return send404(res);
  }

  // SPA fallback
  return serveIndex(req, res);
}
```

MIME types resolved via a small `ext → mime` map. `index.html` always `Cache-Control: no-cache`. Hashed assets are immutable.

#### `server/qr.ts`

Uses the `qrcode` npm package to render ASCII QR into stdout.

LAN IP discovery: enumerate `os.networkInterfaces()`, skip internal/loopback/link-local IPv4, prefer `/24` private ranges (`192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`).

Output format:

```
┌──────────────────────────────────────────────┐
│  awecode web ready                            │
│                                                │
│  Local:        https://localhost:5174         │
│  Network:      https://192.168.1.42:5174      │
│  mDNS:         https://awecode.local:5174     │
│  Token:        7f3a9b21c8e4                    │
│                                                │
│  ▓▓▓▓▓▓▓▓▓▓                                    │
│  ▓▓ ▓▓▓▓ ▓▓   ← scan to open (URL has token)  │
│  ▓▓ ▓▓▓▓ ▓▓                                    │
│  ▓▓▓▓▓▓▓▓▓▓                                    │
│                                                │
│  Ctrl+C to stop                                │
└──────────────────────────────────────────────┘
```

QR encodes the network URL with token as query: `https://192.168.1.42:5174/?token=7f3a9b21c8e4`.

#### `server/tls.ts`

1. Look for `~/.awecode/certs/{fullchain.pem, privkey.pem}`.
2. If present → return `{ cert, key }` buffers.
3. If absent → attempt to generate host certs by invoking `mkcert -cert-file ... -key-file ... localhost <lan-ip> <mdns-name>` via `child_process.execFile`.
4. **NEVER** invoke `mkcert -install`. If `mkcert` reports the CA is not trusted, print "Run `mkcert -install` once, then restart `awecode open web`" and exit non-zero.
5. If `mkcert` is not on PATH → log warning, fall back to HTTP. Service worker will not register on non-localhost origins (PWA installability drops).

#### `server/auth.ts`

```ts
export function generateToken(): string {
  return crypto.randomBytes(6).toString('hex');  // 12 hex chars
}

export function verifyBearer(req: IncomingMessage, expected: string): boolean {
  const header = req.headers.authorization ?? '';
  const url = new URL(req.url ?? '/', 'http://x');
  const candidate = header.startsWith('Bearer ')
    ? header.slice(7).trim()
    : (url.searchParams.get('token') ?? '');
  if (!candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
```

### Client components

#### `transport/client.ts` — `AwecodeClient`

```ts
export class AwecodeClient {
  private ws: WebSocket | null = null;
  private eventCbs = new Set<(ev: GuiAgentEvent) => void>();
  private reconnectMs = 500;
  private readonly maxReconnectMs = 5000;
  private token: string;

  constructor() {
    const params = new URLSearchParams(location.search);
    this.token = params.get('token') ?? localStorage.getItem('awecode.token') ?? '';
    if (params.get('token')) {
      localStorage.setItem('awecode.token', this.token);
      history.replaceState(null, '', location.pathname);
    }
    this.connect();
  }

  private connect(): void {
    const url = new URL('/agent', location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('token', this.token);
    this.ws = new WebSocket(url.toString());
    this.ws.onopen = () => { this.reconnectMs = 500; };
    this.ws.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data) as GuiAgentEvent;
        this.eventCbs.forEach((cb) => cb(ev));
      } catch { /* ignore */ }
    };
    this.ws.onclose = () => {
      setTimeout(() => this.connect(), this.reconnectMs);
      this.reconnectMs = Math.min(this.reconnectMs * 2, this.maxReconnectMs);
    };
  }

  send(cmd: GuiClientCommand): Promise<void> {
    this.ws?.send(JSON.stringify(cmd));
    return Promise.resolve();
  }
  onEvent(cb: (ev: GuiAgentEvent) => void): () => void {
    this.eventCbs.add(cb);
    return () => this.eventCbs.delete(cb);
  }

  async listSessions(): Promise<SessionMeta[]> {
    const r = await fetch('/api/sessions', { headers: this.authHeaders() });
    if (!r.ok) throw new Error(`listSessions: ${r.status}`);
    return r.json();
  }
  async getSession(id: string): Promise<Session | null> {
    const r = await fetch(`/api/sessions/${encodeURIComponent(id)}`, { headers: this.authHeaders() });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`getSession: ${r.status}`);
    return r.json();
  }
  async deleteSession(id: string): Promise<boolean> {
    const r = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
      method: 'DELETE', headers: this.authHeaders(),
    });
    return r.ok;
  }
  async renameSession(id: string, title: string): Promise<SessionMeta | null> {
    const r = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!r.ok) return null;
    return r.json();
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}` };
  }
}

export const apiClient = new AwecodeClient();
```

#### `hooks/useAgent.ts`

Imported from `@awecode/gui`. Web does not rewrite it. The hook is transport-agnostic: it calls `apiClient.onEvent` / `apiClient.send` instead of `window.awecode.*`. The transport is injected via a React context so the same hook works for both Desktop (Electron `ipcRenderer`-backed client) and Web (WebSocket-backed client).

```ts
// packages/gui/src/renderer/src/hooks/useAgent.ts (refactored)
import { TransportContext } from '../transport/context.js';

export function useAgent(): UseAgent {
  const client = useContext(TransportContext);  // apiClient on web, electronClient on desktop
  // ... rest unchanged, calls `client.onEvent` / `client.send` / `client.listSessions` etc.
}
```

Web's `App.tsx` wraps the tree in `<TransportContext.Provider value={apiClient}>`. Desktop's `App.tsx` wraps it with an Electron-backed equivalent.

The `UseAgent` interface gains an `onDone` registration so callers (App.tsx) can wire notification/haptic side-effects:

```ts
export interface UseAgent {
  messages: ChatMessage[];
  status: AgentStatus;
  context: ContextState;
  isStreaming: boolean;
  workflow: { name: string } | null;
  lastError: string | null;
  send: (text: string) => void;
  abort: () => void;
  resetForSession: () => void;
  /** Register a callback fired whenever the agent's 'done' event arrives. */
  onDone: (cb: () => void) => () => void;
}
```

#### `hooks/useSessions.ts`

Imported from `@awecode/gui` (shared). Internally subscribes to `visibilitychange`:

```ts
export function useSessions(client: TransportClient): UseSessions {
  const [list, setList] = useState<SessionMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setList(await client.listSessions());
  }, [client]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const update = () => {
      if (document.hidden) {
        if (timer) { clearInterval(timer); timer = null; }
      } else {
        void refresh();
        timer = setInterval(() => void refresh(), 30_000);
      }
    };
    update();
    document.addEventListener('visibilitychange', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      if (timer) clearInterval(timer);
    };
  }, [refresh]);

  // open(id), remove(id), rename(id, title) — all call client methods + refresh
}
```

Both Desktop and Web use this hook. Web passes `apiClient`, Desktop passes its Electron client.

#### `hooks/useNotifications.ts`

```ts
export function useNotifications(): UseNotifications {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || (navigator as any).standalone === true;  // iOS Safari

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    const p = await Notification.requestPermission();
    setPermission(p);
  }, []);

  const notify = useCallback((title: string, options?: NotificationOptions) => {
    if (permission !== 'granted') return;
    try { new Notification(title, options); } catch { /* ignore */ }
  }, [permission]);

  return {
    permission,
    isStandalone,  // UI uses this to decide whether to show "Enable notifications" button
    requestPermission,
    notifyDone: () => notify('Awecode', { body: 'Agent đã xong', tag: 'done' }),
  };
}
```

`App.tsx` renders an "Enable notifications" button **only when `isStandalone && permission === 'default'`**. In browser mode (not installed as PWA), shows an "Add to Home Screen to enable notifications" hint instead.

#### `components/SidebarDrawer.tsx` (new)

Mobile-only wrapper around the shared `Sidebar`. Renders a hamburger backdrop and slide-in animation. Desktop does not use this wrapper — it renders `Sidebar` (or `WorkspaceSidebar`) directly in the layout.

```tsx
export function SidebarDrawer({ open, onClose, children }) {
  return (
    <>
      {open && <div className="sidebar-backdrop" onClick={onClose} />}
      <div className={`sidebar-drawer ${open ? 'open' : ''}`}>
        {children}
      </div>
    </>
  );
}
```

`App.tsx` (web) uses:
```tsx
<SidebarDrawer open={sidebarOpen} onClose={() => setSidebarOpen(false)}>
  <Sidebar
    sessions={sessions.list}
    activeId={sessions.activeId}
    onSelect={(id) => { void sessions.open(id); setSidebarOpen(false); }}
    onNew={() => { agent.resetForSession(); setSidebarOpen(false); }}
    onDelete={(id) => void sessions.remove(id)}
    onRename={(id, title) => void sessions.rename(id, title)}
  />
</SidebarDrawer>
```

Desktop `App.tsx` uses `<WorkspaceSidebar ... />` directly (no drawer).

#### `components/TranscriptView.tsx` (new)

Renders a past session read-only. **No new component body** — it reuses `<ChatView>`:

```tsx
import { ChatView } from '@awecode/gui/renderer';
import type { Session } from '@awecode/gui/shared/protocol';

export function TranscriptView({ session }: { session: Session }) {
  return (
    <div className="transcript-view">
      <div className="transcript-banner">Viewing past session · read-only</div>
      <ChatView
        messages={session.messages.map((m) => ({ role: m.role, content: m.content }))}
        isStreaming={false}
      />
    </div>
  );
}
```

`isStreaming={false}` already disables the stream cursor in `ChatView`, so no API addition is needed.

#### `components/MenuToggle.tsx` (new)

Hamburger button, fixed top-left, z-index above sidebar drawer. Icon swaps between ☰ and ✕ based on `open` prop. Hidden on desktop via `@media (min-width: 769px) { display: none; }`.

#### `App.tsx` (web)

```tsx
export function App() {
  const agent = useAgent();
  const sessions = useSessions(apiClient);
  const notifications = useNotifications();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [viewingSession, setViewingSession] = useState<Session | null>(null);

  useEffect(() => {
    const off = agent.onDone(() => {
      notifications.notifyDone();
      if ('vibrate' in navigator) navigator.vibrate(50);
    });
    return off;
  }, [agent, notifications]);

  return (
    <ErrorBoundary fallback={<CrashScreen />}>
      <TransportContext.Provider value={apiClient}>
        <div className="app-shell">
          <MenuToggle open={sidebarOpen} onClick={() => setSidebarOpen((v) => !v)} />
          <SidebarDrawer open={sidebarOpen} onClose={() => setSidebarOpen(false)}>
            <Sidebar
              sessions={sessions.list}
              activeId={sessions.activeId}
              onSelect={async (id) => {
                const s = await apiClient.getSession(id);
                if (s) setViewingSession(s);
                setSidebarOpen(false);
              }}
              onNew={() => { agent.resetForSession(); setViewingSession(null); setSidebarOpen(false); }}
              onDelete={(id) => void sessions.remove(id)}
              onRename={(id, title) => void sessions.rename(id, title)}
            />
          </SidebarDrawer>
          <main className="app-main">
            {viewingSession ? (
              <TranscriptView session={viewingSession} />
            ) : (
              <>
                {agent.workflow && <WorkflowIndicator name={agent.workflow.name} />}
                <div className="app-body">
                  <ChatView messages={agent.messages} isStreaming={agent.isStreaming} />
                </div>
                <PromptInput
                  disabled={agent.isStreaming}
                  onSubmit={(v) => agent.send(v)}
                  onAbort={agent.abort}
                  isStreaming={agent.isStreaming}
                />
              </>
            )}
            <StatusBar
              model={agent.status.model}
              cwd={agent.status.cwd}
              usedTokens={agent.context.totalTokens}
              budgetTokens={agent.context.budgetTokens}
              isStreaming={agent.isStreaming}
            />
          </main>
          <PwaInstallPrompt />
        </div>
      </TransportContext.Provider>
    </ErrorBoundary>
  );
}
```

Note: Web's `StatusBar` call omits `showContext` / `onToggleContext` — the "Show ctx" button is hidden on mobile via CSS (see Mobile UX).

---

## Data flow & error handling

### Happy path — user sends prompt

1. User types "viết function sum" in `PromptInput`, presses Enter (or taps Send).
2. `useAgent.send(text)` → `apiClient.send({ type: 'prompt', text })`.
3. Client WebSocket sends `JSON.stringify(cmd)`.
4. Server `ws.on('message')` parses; calls `session.handlePrompt(text)` on the `ProtocolSession`.
5. `ProtocolSession.handlePrompt` (inside `@awecode/agent`):
   - Echoes `{ type: 'message', role: 'user', content: text }` via its `send` sink (→ `ws.send`).
   - Resets `liveMessages = [{ role: 'user', content: text }]`.
   - Calls `runChatLoop(liveMessages, { onToken, onToolCall, onDiffDetected, onIntentDeclared, onDone, abortSignal })`.
   - Each callback emits the corresponding `GuiAgentEvent` via `send`.
6. `applyEvent(sessionRecord, ev)` (inside `ProtocolSession.onEvent` handler in `ws-bridge`) folds the event into the persisted `Session` JSON and calls `saveSession`.
7. Loop ends → `runChatLoop` calls `onDone` → `ProtocolSession` emits final `context_snapshot` + `done`.
8. Client `useAgent` sets `isStreaming = false`, fires its own `onDone` callbacks.
9. `App.tsx`'s `onDone` effect calls `notifications.notifyDone()` and `navigator.vibrate(50)`.

### Network failures

- **WebSocket disconnect mid-stream:** client `ws.onclose` → exponential backoff (500ms → 1s → 2s → 4s → 8s → cap 5s). StatusBar shows "Disconnected, retrying…". Partial assistant message gets a `[stream interrupted]` suffix. On reconnect, a fresh `ready` arrives; user re-sends the prompt (no in-flight replay).
- **Server restart:** client reconnects (token unchanged). Agent state lost (in-process); UI keeps messages, user starts a new prompt.
- **Token expired or wrong:** WS upgrade rejected with 401. Client shows "Token expired. Restart server." REST 401 throws inside `apiClient.*Sessions` and surfaces via error UI.

### Agent errors

- LLM throws inside `runChatLoop` → caught in `ProtocolSession.handlePrompt` → emits `{ type: 'message', role: 'assistant', content: '[error] ...' }` + `onDone` fires.
- Tool call fails → handled inside `runChatLoop`'s internal loop (may retry or surface error).
- Orchestrator (diff apply) fails → caught around `handleDiffDetected` inside `ProtocolSession` → emits `{ type: 'error', message: '[orchestrator] ...' }`.

### Static / PWA caching

- App shell (`index.html`, manifest, icons, `sw.js`): `cache-first`, update via `skipWaiting`.
- Hashed assets (`/assets/index-XXXX.js`): `cache-first`, immutable.
- API (`/api/*`): `network-only`.
- WebSocket: bypasses service worker (browser handles directly).
- Offline: cached shell loads; WebSocket fails → "Server offline" banner; user can still read the last transcript (already persisted and cached).

---

## Dev workflow

Two processes in dev mode:

- `yarn workspace @awecode/web dev` → vite dev server on **port 5173** with HMR.
- `awecode open web --port 5174 --no-serve-static` → Node API server on **port 5174** (no static serving — vite handles it).

`vite.config.ts`:

```ts
export default defineConfig({
  plugins: [react(), VitePWA({ devOptions: { enabled: true }, ... })],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:5174', changeOrigin: true },
      '/agent': { target: 'ws://localhost:5174', ws: true },
    },
  },
});
```

Production: `vite build` → `dist/renderer`. Node server serves `dist/renderer` + API on the same port.

---

## Testing strategy

### Unit tests (vitest)

**`tests/server/auth.test.ts`** — `generateToken` returns 12 hex chars; `verifyBearer` accepts header and `?token=` query; rejects missing/wrong; constant-time (length-equality precondition).

**`tests/server/http-server.test.ts`** — spin up real server on random port:
- `GET /` returns `text/html`.
- `GET /manifest.webmanifest` returns valid manifest.
- `GET /api/sessions` without token → 401.
- `GET /api/sessions` with token → 200, JSON array.
- `GET /api/sessions/nonexistent` with token → 404.
- `DELETE /api/sessions/:id` removes the session.
- `PATCH /api/sessions/:id { title }` renames.
- `GET /random-route` → 200, `index.html` (SPA fallback).

**`tests/server/ws-bridge.test.ts`** — injects a mock `runChatLoop` via `ProtocolSessionOptions.runChatLoop`:
- Connect WS client, send `{ type: 'prompt', text: 'hello' }`.
- Assert client receives: `ready` → `message/user` → `token`+ → `done`.
- Abort mid-stream: send `{ type: 'abort' }` → `done` is the last event.
- Mock `runChatLoop` throws → client receives `error` + `done`.

**`tests/renderer/transport.test.ts`** — mock global `WebSocket`:
- `AwecodeClient` parses `?token=` from URL, saves to `localStorage`, strips from URL.
- Auto-reconnect on close with growing delay.
- Event dispatch to registered callbacks.

### Smoke test (`scripts/smoke-web.mjs`)

1. Spawn `node packages/web/dist/server/index.js --port 5180 --no-tls`.
2. Wait for "awecode web ready" on stdout.
3. Parse token from output.
4. HTTP checks: `GET /` → 200, `text/html`; `GET /api/sessions` with bearer → 200, `[]`.
5. WebSocket check: connect `ws://localhost:5180/agent?token=XXX`, expect `ready`. Send `{ type: 'prompt', text: '__smoke__' }`, expect `{ type: 'message', role: 'user' }` echo.
6. Exit 0 on success, 1 otherwise.

### Manual test checklist (on real phone)

- [ ] `awecode open web` prints QR.
- [ ] Scan QR with iPhone / Android camera → opens link.
- [ ] Token auto-applied → chat UI loads.
- [ ] Send "hello" → response streams.
- [ ] "Add to Home Screen" → icon appears.
- [ ] Open from icon → fullscreen, no address bar.
- [ ] Disable Wi-Fi 5s → auto-reconnects.
- [ ] Stop server → refresh → "Server offline" banner, UI loads from cache.
- [ ] Copy code block: tap Copy → paste in notes app works.
- [ ] Sidebar drawer: open/close smooth, backdrop click closes.
- [ ] mDNS (opt-in): `awecode open web --mdns` → `https://awecode.local:5174` works on iOS/macOS.
- [ ] Haptic (Android): vibration fires on agent finish.
- [ ] Notification (Android PWA): grant permission, agent finishes → notification appears.
- [ ] Session history: send a prompt, restart server, reload page, see the session in sidebar, click → read-only transcript.

---

## Phasing (for the implementation plan)

| Phase | Goal | Est. time |
|---|---|---|
| P1: ProtocolSession refactor | Extract `ProtocolSession` + `applyEvent` into `@awecode/agent`. Refactor Desktop CLI internal mode + `AgentBridge.handle` to use them. Add `onDone` to `runChatLoop`. | 4–5h |
| P2: Persistence layer | Move `sessions.ts` into `@awecode/agent/src/persistence/`. Move `checkpoint.ts` next to it. Re-export from `@awecode/gui`. | 1–2h |
| P3: Workspace cleanup | Move `WorkspaceState` out of `shared/protocol.ts` into `@awecode/gui/src/main/types.ts`. Update Desktop imports. | 30m |
| P4: Shared hooks refactor | Create `useSessions` (shared) + `useWorkspace` (Desktop-only). Refactor Desktop `Sidebar` to use them; split into `Sidebar` + `WorkspaceSidebar`. | 2h |
| P5: Shared component upgrades | Add `Copy` button to Markdown, replace nerd-font glyphs with emoji in ContextPanel, add `ErrorBoundary`. | 1h |
| P6: `@awecode/web` package skeleton | `package.json`, tsconfigs, vite config with proxy + PWA plugin, `startServer()` entrypoint, README. | 1h |
| P7: HTTP server | `http-server.ts`, REST routes, static serve, SPA fallback, MIME map. | 2–3h |
| P8: Auth + TLS + QR | `auth.ts`, `tls.ts` (mkcert), `qr.ts` (ASCII output + LAN IP discovery). | 1–2h |
| P9: WS bridge | `ws-bridge.ts` using `ProtocolSession`. Per-connection state. Save session per event via `applyEvent`. | 2h |
| P10: CLI wiring | `packages/cli/src/commands/web.ts`, register in dispatcher. | 30m |
| P11: Transport client | `AwecodeClient` with auto-reconnect, token handling. | 1h |
| P12: Web renderer | `App.tsx`, `useAgent` refactor to use `TransportContext`, import shared components. | 2h |
| P13: Mobile UX | `SidebarDrawer`, `MenuToggle`, `TranscriptView`, responsive CSS overrides, status bar 44px + hide context button. | 2h |
| P14: PWA | Manifest, icons, SW registration, `PwaInstallPrompt`. | 1h |
| P15: Notifications + haptics | `useNotifications` with standalone-mode gating, wire to `agent.onDone`. | 30–60m |
| P16: mDNS (opt-in) | `mdns.ts` with `bonjour-service`, flag-gated, 3s timeout. | 30m |
| P17: Graceful shutdown | `SIGINT`/`SIGTERM` handlers in `startServer`. | 30m |
| P18: Tests | Unit tests + smoke test. | 2–3h |

**Total:** ~22–29 hours. Critical path (P1–P13): ~18–22 hours.

---

## YAGNI — explicitly out of scope

- **Interactive approval UI** for v0.1. `ApprovalQueue` currently handles Diff Blocks only, and the TUI/GUI both flow through the Orchestrator's readline path. Real interactive approval is a separate feature that must extend `@awecode/agent` first, then reach Desktop and Web together.
- Web Push (VAPID) background delivery.
- Multi-user hosting, rate limiting, quotas.
- Multiple simultaneous sessions per tab.
- Voice input / speech-to-text.
- Image upload.
- File picker / upload from phone to server.
- Theme switcher.
- Encrypt session files on disk.
- Session export / import.
- Re-encoding video / proxying PWA assets.
- Resuming past sessions by continuing to chat (read-only view only).
- WebSocket heartbeat / ping-pong (auto-reconnect handles drops).
- mkcert auto-install (user must run `mkcert -install` once manually).
- Multi-project switching in Web UI (run multiple servers instead).
- mDNS on by default (opt-in via `--mdns`).

---

## Risks & mitigations

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| iOS Safari PWA limitations (no background push, SW quirks, idle WS drops) | High | Certain | Document Android as reference. Auto-reconnect handles drops. Local notifications fire only when tab is open. |
| Mixed content (HTTPS server + `ws://`) | High | Certain | mkcert HTTPS + `wss://` matching scheme. HTTP fallback disables SW. |
| mkcert not present | Medium | Medium | Detect at startup; print install instructions; exit non-zero. `--no-tls` override for dev. |
| Token leak via referrer header on external link | Low | Low | `rel="noreferrer noopener"` on all external anchors (Markdown renderer already does this). |
| Firewall blocks port 5174 | Medium | Possible | Document port opening; allow `--port 443`. |
| mDNS doesn't work on Android (needs Bonjour) | Medium | Likely | mDNS is opt-in, not default. QR uses LAN IP directly. |
| Service worker stale cache on iOS after update | Medium | Possible | `registerType: 'autoUpdate'` + cleanup old caches in `activate` handler. |
| ProtocolSession refactor regresses Desktop | Medium | Possible | Existing Desktop tests (`ApprovalView.test.tsx`, `ChatView.test.tsx`) cover regression surface. New `protocol-session.test.ts` added. |
| mkcert generates certs with wrong SAN | Low | Low | mkcert is invoked with explicit host list: `localhost <lan-ip> <mdns-name>`. |
| File watching not triggered when editing from phone | By design | — | Document: agent edits files on the computer, not on the phone. |

---

## Known limitations (not bugs)

- The computer must stay powered on and connected to the network throughout the session.
- The agent edits files on the computer; the phone is a thin client only.
- Session resume is read-only for v0.1 (clicking a past session shows its transcript; you cannot continue chatting in it).
- Local notifications do not fire when the tab is in the background on iOS.
- `awecode.local` mDNS hostname requires Bonjour support (built into iOS/macOS; Android needs a separate service).

---

## Glossary

- **PWA** — Progressive Web App. A web page that, via a manifest and service worker, can be installed on the home screen and run fullscreen like a native app.
- **mkcert** — A tool that creates a locally-trusted TLS certificate authority and per-host certificates, so HTTPS works without warnings on machines that trust that CA.
- **mDNS / Bonjour** — Multicast DNS. Lets a device advertise a human-readable hostname (e.g. `awecode.local`) on the local network without a DNS server.
- **Service Worker** — A browser feature: a script that runs in the background, separate from web pages, enabling offline caching, push notifications, and other PWA capabilities.
- **ProtocolSession** — Transport-agnostic agent session object in `@awecode/agent`. Owns `liveMessages`, `abortController`, lazy `Orchestrator`. See [ADR-0007](../../adr/0007-extract-protocol-session.md).
- **Transport adapter** — The thin layer that converts a `ProtocolSession`'s event emission into bytes on a specific transport (stdio NDJSON, WebSocket JSON frames). Does not contain agent logic.
- **applyEvent** — Pure function in `@awecode/agent/persistence/session-event-handler.ts` that folds a `GuiAgentEvent` into a `Session` record. Shared by Desktop's `AgentBridge` and Web's `ws-bridge` so both persist transcripts identically.
