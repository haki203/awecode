# Grill log — Awecode Web mobile design

**Date:** 2026-06-21
**Spec:** `design.md` (this folder)
**Method:** `grill-with-docs-v2` skill — batched questions, Options → Recommend → Why, codebase-driven.
**Outcome:** 41 decisions locked. Spec rewritten clean; two ADRs filed (`0007`, `0008`); `CONTEXT.md` updated with new domain terms.

This file is the audit trail. The clean spec lives in `design.md`. Read this when you want to understand *why* a decision went the way it did.

---

## Pre-grill (brainstorming)

The user picked, in order: **PWA** as the approach, **LAN self-hosting** as the deploy model, a **new `@awecode/web` package** as the code layout, **in-process agent** (not child-spawn like Desktop), **bearer token + QR** for auth, **list-only** session resume, **full PWA** scope, **local Notification** (no VAPID), **separate ApprovalView** (later overturned — see Q1).

These pre-grill choices set the initial spec that was then grilled.

---

## Batch 1 — Architecture, reuse, dead code

### Q1. ApprovalKind = `'shell_exec' | 'diff_apply'` was invented by the spec — code only has diff approval

Code evidence: `packages/agent/src/approval.ts:18-22` shows `ApprovalRequest` carries `parsedDiff`, not a kind discriminator. `shell_exec` runs without approval (60s timeout only). `chat.tsx:73-76` comment notes the legacy TUI approval overlay was already removed.

- **Options:**
  - A. Drop approval entirely from web MVP. Agent runs as Desktop does today (Orchestrator's readline path).
  - B. Keep approval but only for `'diff_apply'`, drop `'shell_exec'`. Still requires inventing new protocol events.
  - C. Implement real approval for both shell and diff. Requires extending `@awecode/agent` first.
- **Recommend:** A
- **Why:** The user's earlier "auto-approve for MVP" answer already implied A; the spec's later `ApprovalKind` was an unprincipled expansion. B still requires protocol changes for a feature that has no caller today. C is a separate project entirely. A keeps the spec honest with the code.
- **Resolution:** Approval is out of scope for v0.1. Documented in design.md "Non-goals" and "YAGNI".

### Q2. Spec's `Sidebar.tsx` props signature was invented — real signature uses `WorkspaceState` + `currentCwd`

Code evidence: `packages/gui/src/renderer/src/components/Sidebar.tsx:21-31` has `workspace`, `currentCwd`, `onPickWorkspace`, `onSwitchWorkspace`. Sidebar also self-fetches via `window.awecode.listSessions()` at line 64-67.

- **Options:**
  - A. Spec rewrite: copy Sidebar verbatim, add `isOpen`/`onClose`. Web drops the workspace bits.
  - B. Refactor Sidebar at the Desktop level: extract a `useSessions` hook, share between Desktop and Web.
  - C. Web writes a new Sidebar, doesn't share. Dead code path.
- **Recommend:** B
- **Why:** A inherits the existing anti-pattern (component self-fetching). C creates divergence. B is the clean architecture move: separate presentation from data fetching, share the hook across clients. Adds ~2-3h to the plan but prevents a long-term dead code path.
- **Resolution:** Refactor into `useSessions` (shared) + `useWorkspace` (Desktop-only). Sidebar becomes a shared layout component; `WorkspaceSidebar` wraps it with multi-project header for Desktop only.

### Q3. Web sidebar + WorkspaceState — keep or drop?

- **Options:**
  - A. Drop entirely. Server binds one cwd; sidebar has only `[+ New chat]` + session list.
  - B. Keep "Recent projects" read-only with a toast "restart with --cwd".
  - C. Multi-project = one server per project. UI has no switcher.
- **Recommend:** A + C
- **Why:** B is a feature present but broken. C is the correct architecture for multi-project on the web (independent processes). A + C: drop the UI entirely, multi-project is a server-side concern.
- **Resolution:** Web sidebar drops `WorkspaceState`. Multi-project is achieved by running multiple `awecode open web` on different ports.

### Q4. Session filtering — spec said "server filters by cwd", code is client-side

Code evidence: `packages/gui/src/main/sessions.ts:88-91` already has `listSessionsInWorkspace(cwd)`. With one-cwd-per-server, the filter needs no parameter.

- **Options:**
  - A. REST takes no param: `GET /api/sessions` always filters by server.cwd.
  - B. REST takes `?cwd=<path>`.
  - C. Return all sessions, client filters.
- **Recommend:** A
- **Why:** A matches the one-server-one-cwd model. B is over-engineering for a parameter no one will set. C leaks other projects' file paths to the client.
- **Resolution:** `GET /api/sessions` filters by server's bound cwd. No query parameter.

### Q5. `injectMessage` — API bloat or necessary?

The spec added `injectMessage` to `UseAgent` to let `useSessions.open(id)` replay history. Pushing data into a hook that's otherwise an event-folder breaks the abstraction.

- **Options:**
  - A. Keep `injectMessage` in useAgent. Two responsibilities in one hook.
  - B. Separate concerns: useAgent only folds events. Replay goes through App-level state.
  - C. Drop session replay entirely. Read-only transcripts render through a separate `<TranscriptView>`.
- **Recommend:** C
- **Why:** A is API bloat. B over-complicates state ownership. C is simplest: past sessions are read-only (already decided), so render them through `<ChatView>` directly without involving `useAgent`. `useAgent` only manages the active conversation.
- **Resolution:** `TranscriptView` renders past sessions via `<ChatView messages={history} isStreaming={false} />`. No new component body, no `injectMessage`.

### Q6. Heartbeat `ping/pong` — really needed for MVP?

- **Options:**
  - A. Drop heartbeat. Auto-reconnect handles drops.
  - B. Keep 30s heartbeat as spec said.
  - C. Heartbeat only when backgrounded.
- **Recommend:** A
- **Why:** B adds protocol types and timer logic for a problem not yet observed. A follows YAGNI; if iOS testing reveals frequent drops, add later. C is correct but over-engineered for MVP.
- **Resolution:** No heartbeat. Client auto-reconnects with exponential backoff (500ms → 5s).

### Q7. `sessions.ts` reuse — import from `@awecode/gui`, new package, duplicate, or move?

The spec proposed `export * as sessions from './main/sessions.js'` in `@awecode/gui/src/index.ts`. Risk: bundler pulls Electron deps when Web imports from `@awecode/gui`.

- **Options:**
  - A. Move `sessions.ts` into `@awecode/agent/src/persistence/`. Desktop re-exports to avoid breakage.
  - B. New `@awecode/persistence` package.
  - C. Duplicate into `@awecode/web`.
  - D. Keep in `@awecode/gui`, export and hope tree-shaking works.
- **Recommend:** A
- **Why:** B is over-engineered for one file. C creates dead code. D risks pulling Electron's main entry into Web's bundle. A puts the dependency direction right: `@awecode/agent` is the core; both Desktop and Web are clients; persistence belongs in core.
- **Resolution:** `packages/agent/src/persistence/sessions.ts`. `@awecode/gui/src/main/sessions.ts` becomes a 1-line re-export. Web imports from `@awecode/agent`.

### Q8. CSS responsive: `.app-shell { display: flex }` + `.sidebar { flex: 0 0 240px }` — drawer needs `position: fixed`

- **Options:**
  - A. Media query override at the end of styles.css: mobile sidebar becomes fixed + transform.
  - B. Refactor CSS to Grid with `display: none` toggling.
  - C. Two CSS files entirely.
- **Recommend:** A
- **Why:** A is the standard responsive pattern and doesn't touch Desktop. B over-engineers layout. C creates divergence.
- **Resolution:** Mobile overrides live at the end of `styles.css`: `@media (max-width: 768px) { .sidebar { position: fixed; transform: translateX(-100%); transition: transform 0.2s; } .sidebar.open { transform: translateX(0); } }`.

### Q9. Copy button — shared (add to `@awecode/gui` Markdown) or web-only?

- **Options:**
  - A. Add to `@awecode/gui` Markdown. Drag-along improvement for Desktop.
  - B. Web-only via subclassing.
  - C. Skip for MVP.
- **Recommend:** A
- **Why:** B creates divergence. C drops a genuinely useful feature (Copy is more valuable on mobile than desktop). A is DRY and improves Desktop. ~30 minutes extra.
- **Resolution:** `packages/gui/src/renderer/src/components/Markdown.tsx` gains a Copy button on every code block via a custom `pre` renderer.

### Q10. Dev workflow — vite proxy, build watcher, or "build first"?

- **Options:**
  - A. Vite dev server (HMR) + Node API server. Vite proxy `/api` + `/agent`.
  - B. Vite plugin auto-starts Node server.
  - C. Node server in middleware mode.
- **Recommend:** A
- **Why:** B is magic and hard to debug. C lacks full HMR. A is the standard pattern; t开挖 concerns cleanly.
- **Resolution:** `vite.config.ts` has `server.proxy` for `/api` and `/agent`. Dev runs two processes on ports 5173 (vite) and 5174 (Node).

---

## Batch 2 — Component decomposition, types, UX

### Q11. `useSessions` vs `useWorkspace` — one hook or two?

Q2 decided on refactoring Sidebar. Q3 decided Web drops multi-project. So the hook shape has to serve both.

- **Options:**
  - A. One hook `useSessions` covers both, Web just ignores workspace fields.
  - B. Two hooks: `useSessions` (shared) + `useWorkspace` (Desktop-only).
  - C. Web doesn't refactor Sidebar (overrides Q2).
- **Recommend:** B
- **Why:** A makes Web import code it doesn't use. C contradicts Q2. B follows single responsibility: each hook owns one concern. Web imports `useSessions` only, never sees `useWorkspace`.
- **Resolution:** Two hooks in `@awecode/gui/src/renderer/src/hooks/`.

### Q12. `TranscriptView` — reuse ChatView or new component?

Q5 decided past sessions render through a separate path. Reuse `ChatView`?

- **Options:**
  - A. `ChatView` gains a `readOnly?` prop. TranscriptView = `<ChatView readOnly ...>`.
  - B. New `TranscriptView.tsx`, copy of ChatView without streaming.
  - C. Just use `<ChatView messages={history} isStreaming={false} />`. No prop addition.
- **Recommend:** C
- **Why:** A adds API surface for a case the existing API already handles (`isStreaming={false}` already disables the cursor). B duplicates code. C is the simplest thing that works.
- **Resolution:** `TranscriptView` is a thin wrapper around `<ChatView>` with a banner. No API changes to ChatView.

### Q13. Where in `@awecode/agent` does `sessions.ts` go?

Q7 decided "into agent". Where exactly?

- **Options:**
  - A. New `persistence/` folder. Future home for checkpoint too.
  - B. Root of `src/`, next to `chat.ts`.
  - C. Inside `context/` (wrong domain).
- **Recommend:** A
- **Why:** B works for one file but becomes messy when checkpoint moves. C is wrong — sessions are not in-memory context. A creates the right layer separation. `checkpoint.ts` is also misplaced today; moving both together is the right boundary.
- **Resolution:** `packages/agent/src/persistence/{sessions,checkpoint,session-event-handler}.ts`.

### Q14. Vite proxy config — exact dev workflow?

Q10 decided vite dev + Node server. Specifics?

- **Options:**
  - A. `vite.config.ts` has `server.proxy` for `/api` and `/agent`. Two terminals.
  - B. Vite plugin auto-starts Node server via `configureServer`.
  - C. Node server integrates vite middleware.
- **Recommend:** A
- **Why:** B is opaque; hard to debug. C loses full HMR. A is explicit and standard.
- **Resolution:** Documented in design.md "Dev workflow" with the exact vite proxy config.

### Q15. `WorkspaceState` location — protocol.ts or Desktop-only?

Currently exported from `shared/protocol.ts`. Web doesn't use it.

- **Options:**
  - A. Keep in shared protocol; Web just doesn't use.
  - B. Move to `packages/gui/src/main/types.ts` (Desktop-only).
  - C. Delete; Desktop defines locally.
- **Recommend:** B
- **Why:** A leaves a confusing shared type that's actually Desktop-only. C breaks Desktop imports immediately. B cleanly separates: `shared/protocol.ts` = wire format only; `main/types.ts` = Desktop presentation types.
- **Resolution:** `WorkspaceState` moves to `packages/gui/src/main/types.ts`. Update imports.

### Q16. Copy button — `navigator.clipboard` works in both Electron and Web?

- **Options:**
  - A. Use `navigator.clipboard.writeText`. Works in Chromium (Electron) and all modern browsers.
  - B. Branch on environment: web navigator.clipboard, Electron `require('electron').clipboard`.
  - C. Utility with feature detection.
- **Recommend:** A
- **Why:** B over-engineers. C adds a util for one line. A works everywhere — Electron renderer has `navigator.clipboard` from Chromium.
- **Resolution:** `navigator.clipboard.writeText(text)` in the Copy button handler.

### Q17. ContextPanel nerd-font glyphs — fallback for mobile?

`ContextPanel.tsx:24-31` uses nerd-font codepoints (`󰈙`, `🗺`) that mobile fonts don't have.

- **Options:**
  - A. Replace with Unicode emoji (`📄`, `🗺`, `✂`, `ƒ`, `▸`, `Δ`). Drag-along Desktop improvement.
  - B. Load nerd-font via `@font-face`. 5MB+ font file.
  - C. Inline SVG icons.
  - D. Leave as-is — mobile shows tofu boxes.
- **Recommend:** A
- **Why:** B is too heavy. C is overkill for MVP. D ships a visual bug. A is minimum work + universal rendering + Desktop improvement.
- **Resolution:** Replace nerd-font codepoints with Unicode emoji in `ContextPanel.tsx`. Add `font-family: 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif` fallback on `.glyph`.

### Q18. `useSessions` refresh — auto-poll, explicit, or visibility-driven?

- **Options:**
  - A. `startPolling`/`stopPolling` methods. Caller controls.
  - B. Always poll every 30s regardless.
  - C. `visibilitychange` listener: poll when visible, skip when hidden.
  - D. Event-driven via WebSocket `session_updated` events.
- **Recommend:** C
- **Why:** A pushes complexity to caller. B wastes energy when tab is hidden. D over-engineers for one-user use case. C is the web standard pattern, 4 lines of code.
- **Resolution:** `useSessions` internally subscribes to `visibilitychange`. Polls 30s when visible, stops when hidden. Always refreshes on user actions (delete/rename/open).

### Q19. Mobile status bar — 28px is below touch target minimum

`styles.css:447` sets `.status-bar { height: 28px }`. Apple HIG wants 44px minimum.

- **Options:**
  - A. Mobile override: `@media (max-width: 768px) { .status-bar { height: 44px; } }`.
  - B. 44px everywhere.
  - C. Hide status bar on mobile, move info to drawer.
  - D. Drop "Show ctx" button on mobile status bar.
- **Recommend:** A + D
- **Why:** B hurts Desktop UX. C loses visibility. A is the baseline mobile fix. D removes a rarely-used-on-mobile button.
- **Resolution:** Mobile CSS: status bar 44px. "Show ctx" button hidden on mobile via `display: none` in the same media query.

### Q20. `awecode open web` CLI command vs `awecode open gui` — share how?

`packages/cli/src/commands/gui.ts` exists. Spec proposes new `web.ts`.

- **Options:**
  - A. Two separate files. Each imports shared libs from `@awecode/agent`. CLI dispatcher switches on subcommand.
  - B. Unified `open.ts` with subcommand switch.
  - C. Web runs directly via `node packages/web/dist/server/index.js`.
- **Recommend:** A
- **Why:** B is a refactor without a clear payoff. C drops CLI ergonomics. A keeps two distinct entry points (Electron launcher vs HTTP server), each focused on its transport.
- **Resolution:** `packages/cli/src/commands/web.ts` added. Dispatcher in `packages/cli/src/index.ts` extended.
- **Note:** Q33 later reopens this — the agent logic shared between `gui.ts` internal mode and `web.ts` ws-bridge is extracted into `ProtocolSession` (ADR-0007).

---

## Batch 3 — Protocol, testing, deployment

### Q21. After dropping approval, does Web extend the protocol at all?

- **Options:**
  - A. Use `GuiAgentEvent` / `GuiClientCommand` verbatim. No `packages/web/src/shared/protocol.ts`.
  - B. Keep a re-export file just in case.
  - C. Add `'disconnected'` event.
- **Recommend:** A
- **Why:** B is dead code. C duplicates native WebSocket events. A follows YAGNI and DRY.
- **Resolution:** Web imports directly from `@awecode/gui/shared/protocol`. No Web-specific protocol file.

### Q22. Potential double-`done` in `handlePrompt` finally block — keep or fix?

`packages/cli/src/commands/gui.ts:318-322` emits `done` in a `finally`. There's no other emission in `handlePrompt`, but the pattern is fragile.

- **Options:**
  - A. Copy as-is, client is idempotent anyway.
  - B. Refactor: remove `done` from finally, emit at clear completion points.
  - C. Web writes `handlePrompt` fresh, cleaner.
- **Recommend:** A (now superseded by Q35 — see below)
- **Why at the time:** B risks Desktop regression. C diverges code paths. A inherits behavior consistently.
- **Later development:** Q33 reopens this. The cleanest fix is to extract `ProtocolSession` and add `onDone` to `runChatLoop`, which removes the double-`done` risk for all callers at once. See ADR-0007.

### Q23. `token` event chunking — render strategy?

`runChatLoop` calls `onToken(chunk)` where chunk size is provider-dependent.

- **Options:**
  - A. Append chunk to last assistant message (current Desktop behavior).
  - B. Buffer 50ms, send batch.
  - C. Add `message_start` / `message_end` events.
- **Recommend:** A
- **Why:** B is premature optimization. C adds protocol for a non-problem (Desktop already works with the "last role" heuristic). A keeps Desktop and Web consistent.
- **Resolution:** No change. Web inherits Desktop's append-to-last-assistant behavior in `useAgent`.

### Q24. `ws-bridge.test.ts` — how to mock `runChatLoop`?

Spec says "mock runChatLoop". Static import makes this non-trivial.

- **Options:**
  - A. `vi.mock('@awecode/agent', ...)` — module replacement.
  - B. Dependency injection: `attachWsServer(server, { ..., runChatLoop })`.
  - C. Test at integration level via Vercel AI SDK middleware.
  - D. Skip ws-bridge tests.
- **Recommend:** B
- **Why:** A depends on vitest internals. C is complex setup. D loses coverage. B is clean architecture: the caller injects the dependency. This dovetails with Q33 — `ProtocolSession` already takes `runChatLoop` via options.
- **Resolution:** `ProtocolSessionOptions.runChatLoop?: typeof runChatLoop`. Tests pass a mock.

### Q25. Static asset caching strategy?

- **Options:**
  - A. Spec current: `index.html` no-cache, hashed assets immutable.
  - B. SW cache hashed assets with stale-while-revalidate.
  - C. No cache headers.
- **Recommend:** A
- **Why:** B is over-engineered for MVP. C is wrong. A is the production standard, matches vite's defaults.
- **Resolution:** No change to spec. Documented explicitly with the rationale "matches vite build defaults".

### Q26. mDNS hostname conflict — what if user runs two servers?

- **Options:**
  - A. Always `awecode.local`. Silent conflict.
  - B. Per-port hostname `awecode-5174.local`.
  - C. Per-project `myproject.local`.
  - D. Off by default, opt-in via `--mdns`.
- **Recommend:** D
- **Why:** A fails silently. B is ugly. C collides with same-named projects. D makes the feature explicit; user owns conflict resolution.
- **Resolution:** `awecode open web --mdns [--mdns-name awecode]`. Off by default.

### Q27. mkcert auto-install — security smell?

- **Options:**
  - A. Spec current: auto-run `mkcert -install`. Silent privilege escalation.
  - B. Detect, print instructions, exit. User runs `mkcert -install` manually.
  - C. Drop mkcert integration, HTTP-only.
  - D. Awecode manages own CA in `~/.awecode/ca/`.
- **Recommend:** B
- **Why:** A is a security bad practice. C drops PWA features. D is complex. B is developer-friendly and user-controlled.
- **Resolution:** Server never calls `mkcert -install`. On first run without certs, prints instructions and exits non-zero.

### Q28. Notification permission — iOS 16.4+ needs PWA installed first

- **Options:**
  - A. Button in sidebar, user clicks to enable.
  - B. Request on first user click anywhere.
  - C. Detect standalone mode; only show option if installed.
  - D. Drop notifications.
- **Recommend:** A + C
- **Why:** B silently fails on iOS. D drops a feature. C is the correct pattern but leaves browser users without any signal. A + C: show the button only in standalone mode, give browser users an "Add to Home Screen" hint instead.
- **Resolution:** `useNotifications` exposes `isStandalone`. `App.tsx` renders "Enable notifications" only when `isStandalone && permission === 'default'`.

### Q29. Test coverage threshold?

- **Options:**
  - A. No threshold for MVP. Write valuable tests.
  - B. 80% coverage enforced.
  - C. 100% server / 50% renderer.
  - D. Smoke test only.
- **Recommend:** A
- **Why:** B is unrealistic for MVP. C uses meaningless metrics. D loses confidence. A is pragmatic.
- **Resolution:** No threshold. Tests prioritize critical paths (auth, ws-bridge, transport).

### Q30. Build wiring in monorepo?

- **Options:**
  - A. Rely on `yarn workspaces foreach --topological`. Web's `package.json` scripts handle its own build.
  - B. `packages/cli` prebuild hook builds Web first.
  - C. No build — runtime TS compilation.
- **Recommend:** A
- **Why:** B is explicit coupling. C is not production-ready. A is the standard monorepo pattern already used.
- **Resolution:** `@awecode/web` package.json has `"build": "vite build && tsup"`. Root `yarn build` handles ordering topologically.

### Q31. Server lifecycle — Ctrl+C handling?

Spec didn't address. User pressing Ctrl+C should be graceful.

- **Options:**
  - A. Handle SIGINT/SIGTERM: close HTTP, abort active sessions, close WS.
  - B. Let Node default: process dies, clients reconnect-fail.
  - C. "Shutting down... Ctrl+C again to force" pattern.
- **Recommend:** A
- **Why:** B accepts silent disconnect. C over-engineers. A is production-standard, ~5-10 lines, ensures sessions are already-saved before death.
- **Resolution:** `startServer` registers SIGINT/SIGTERM handlers. Sessions persist on each event so no data loss.

### Q32. Spec organization — one file or split?

Spec grew to 1100+ lines + 32 decisions.

- **Options:**
  - A. One big file with grill decisions appended.
  - B. Split: `design.md` (clean) + `grill-log.md` (audit).
  - C. Rewrite clean, drop grill log.
- **Recommend:** B
- **Why:** A becomes unreadable. C loses the why. B keeps the clean spec navigable for implementation while preserving the audit trail for future reviewers.
- **Resolution:** This file (`grill-log.md`) + `design.md` + two ADRs (`0007`, `0008`).

---

## Batch 4 — Clean architecture deep-dive (after user said "không ngại refactor lớn")

### Q33. (Reopens Q20 + Q22) `handlePrompt` 75 lines duplicated — cleanest refactor?

With the "clean architecture first" mandate, the prior "duplicate is OK" answer is no longer acceptable.

- **Options:**
  - A. Extract `ProtocolSession` into `@awecode/agent`. Both Desktop CLI internal mode and Web ws-bridge instantiate one with a transport-specific sink.
  - B. Pure function `adaptRunChatLoopToEvents(...)`. Moves code but doesn't encapsulate state.
  - C. New package `@awecode/protocol-server`. Over-engineered.
  - D. Duplicate (original Q22 answer).
- **Recommend:** A
- **Why:** D keeps the debt. B doesn't fix the state-setup duplication. C is overkill. A is the right abstraction: ProtocolSession owns the per-conversation state + event emission; transports are ~30-line adapters. Fixes Q22's double-`done` risk for all callers.
- **Resolution:** Filed as [ADR-0007](../../../adr/0007-extract-protocol-session.md). Three callers: Desktop stdio, Web WebSocket, TUI direct.

### Q34. Session persistence in Web — spec didn't have it

`packages/gui/src/main/index.ts:220-281` (`AgentBridge.handle`) folds each event into the session JSON and saves. Web needs the same behavior or restart loses transcripts.

- **Options:**
  - A. Web ws-bridge duplicates ~60 lines.
  - B. Extract `applyEvent(session, ev)` into `@awecode/agent/persistence/`. Both clients import.
  - C. REST-based persistence: POST each message.
  - D. Web calls `useSessions` hook (server-side, nonsense).
- **Recommend:** B
- **Why:** A creates drift. C is race-prone. D is nonsense. B is correct: `applyEvent` is a pure transformation, belongs in the persistence layer, shared by both clients.
- **Resolution:** `packages/agent/src/persistence/session-event-handler.ts` exports `applyEvent(session, ev)`. Desktop's `AgentBridge.handle` and Web's ws-bridge both call it.

### Q35. `runChatLoop` has no `onDone` — add it?

Callers wrap in try/finally. The potential double-`done` (Q22) is a symptom.

- **Options:**
  - A. Add `onDone?: () => void` to `ChatLoopOptions`. Called in `finally` inside `runChatLoop`.
  - B. Return status object.
  - C. Keep try/finally at caller side.
- **Recommend:** A
- **Why:** C is the existing debt. B is more API for the same info. A is the cleanest callback; ProtocolSession uses it, eliminating the double-`done` risk.
- **Resolution:** `ChatLoopOptions.onDone?: () => void`. `ProtocolSession` uses it.

### Q36. `workspaces.ts` — newly discovered, what to do?

`packages/gui/src/main/workspaces.ts` has Desktop-only multi-project persistence.

- **Options:**
  - A. Keep in `@awecode/gui/src/main/`. Desktop-only.
  - B. Move into `@awecode/agent/persistence/`.
  - C. New `@awecode/persistence` package.
  - D. Merge with `WorkspaceState` in `@awecode/gui/src/main/types.ts`.
- **Recommend:** A
- **Why:** B puts Desktop-specific code in core. C is overkill. D mixes types with logic. A is correct: multi-project state is Desktop-specific; Web doesn't use it.
- **Resolution:** `workspaces.ts` stays in `@awecode/gui/src/main/`. Not moved.

### Q37. Component rendering duplication — copy or cross-package import?

Original spec said "copy components folder to Web".

- **Options:**
  - A. Copy all components.
  - B. New shared package `@awecode/renderer-components`.
  - C. Cross-package direct import: Web imports from `@awecode/gui/src/renderer/src/components/`.
  - D. Export components via `@awecode/gui` public API.
- **Recommend:** C
- **Why:** A duplicates code. B is over-engineered. D breaks encapsulation by exposing renderer internals via public API. C uses Vite + TypeScript workspace support; bug fixes apply once.
- **Resolution:** Web imports from `packages/gui/src/renderer/src/components/*` directly. Vite resolves at dev time; production bundle includes once.

### Q38. `ChatMessage` type — duplicated?

Defined in `packages/gui/src/renderer/src/hooks/useAgent.ts:21-24`. Web needs the same type.

- **Options:**
  - A. Move into `shared/protocol.ts`.
  - B. Export from `useAgent.ts`. Web imports.
  - C. Each client defines locally.
  - D. Move into `@awecode/agent` public API.
- **Recommend:** B
- **Why:** A is wrong layer (wire vs view model). C drifts. D puts view models in core. B is correct: the type travels with the hook that owns it.
- **Resolution:** `useAgent.ts` exports `ChatMessage`. Web imports it.

### Q39. Build order / dependency DAG after refactor?

- **Options:**
  - A. agent ← (llm, tools, diff, workflow); gui ← agent + llm; web ← agent + gui; cli ← all.
  - B. New `@awecode/protocol-server` package owns `ProtocolSession`.
  - C. Keep `ProtocolSession` in `@awecode/agent`.
- **Recommend:** A + C
- **Why:** B is only justified if external consumers want `ProtocolSession`. Currently only Web + Desktop internal use it. A + C: ProtocolSession lives in `@awecode/agent`; dependency direction stays clean.
- **Resolution:** Documented in ADR-0007 with DAG diagram.

### Q40. Error boundary — needed?

Component crashes (e.g. Markdown on malformed input) can white-screen the app.

- **Options:**
  - A. Add `<ErrorBoundary>` wrap App on Web.
  - B. Add to Desktop too (drag-along).
  - C. Skip, React 19 has some dev handling.
  - D. Component-level boundaries.
- **Recommend:** A + B
- **Why:** C doesn't cover production. D is over-engineering. A + B: shared `ErrorBoundary` in `@awecode/gui`, both clients wrap.
- **Resolution:** `packages/gui/src/renderer/src/components/ErrorBoundary.tsx`. Both App.tsx files use it.

### Q41. Final spec organization?

- **Options:**
  - A. Two files: `design.md` clean + `grill-log.md` audit. Update CONTEXT.md. File ADRs for the two biggest architectural decisions.
  - B. One clean file, drop grill log.
  - C. Keep original spec + update.
  - D. ADR-0007 covers everything.
- **Recommend:** A
- **Why:** C is unwieldy. B loses audit. D conflates levels. A is the right balance: design.md for the implementation plan to follow, grill-log.md for the why, ADRs for the two hardest-to-reverse decisions (ProtocolSession extraction + PWA-not-native).
- **Resolution:** This file + `design.md` + `docs/adr/0007-*.md` + `docs/adr/0008-*.md` + updated `CONTEXT.md`.
