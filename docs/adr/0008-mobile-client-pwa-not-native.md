# Mobile client: PWA, not native

## Status

Accepted (2026-06-21)

## Context

Awecode shipped with two front-ends: an Ink TUI (`@awecode/cli`) and an Electron desktop GUI (`@awecode/gui`). Both are thin shells over `runChatLoop` from `@awecode/agent`. Mobile is the missing surface.

The agent needs filesystem access, so it cannot run on the phone. The phone must be a thin client to an agent process running on the developer's computer.

We considered four approaches:

1. **PWA / Web app.** Serve the existing React renderer from a small HTTP/WebSocket server embedded in the CLI. Phone browser connects over LAN.
2. **Capacitor wrapper** around the React renderer. Native iOS/Android shell, App Store distribution.
3. **React Native rewrite.** Native-feeling UI, no code reuse with Desktop renderer.
4. **Tauri 2 Mobile.** Single codebase with Desktop (would also require migrating Desktop off Electron).

The full trade-off matrix is captured in `docs/superpowers/specs/2026-06-21-web-mobile-design/grill-log.md` Q1–Q10. The relevant architectural axes:

- **Code reuse with Desktop.** PWA can import Desktop's React components directly (cross-package, no copy). Capacitor: also high. React Native: zero. Tauri: medium (would require desktop migration first).
- **Iteration speed (time to MVP).** PWA: 10–13 hours. Capacitor: +1 week. React Native: +2–4 weeks. Tauri: +2–3 weeks and alpha-quality mobile.
- **Native feel.** PWA: good, not perfect. Capacitor: better. React Native: best. Tauri: good.
- **App Store.** PWA: no. Others: yes.
- **Background push.** PWA: Android yes (recent Chrome), iOS no (only foreground). Native: yes.

## Decision

Build a **PWA** in a new package `@awecode/web`. The phone is a thin client; the agent runs in the same Node process that serves the PWA over HTTPS on the developer's machine.

### Constraints baked into the decision

- The computer must stay powered on and networked for the duration of the session. User-accepted.
- The phone is a **thin client**. No code is executed on the phone. All file edits happen on the computer.
- One server = one project (`cwd`). Multi-project switching happens by running multiple servers on different ports.
- Local `Notification` API only — no VAPID Web Push for MVP.

## Consequences

- **Positive**
  - Reuses ~90% of Desktop renderer (same components, same protocol types, same agent).
  - No native build pipeline, no signing certificates, no App Store review.
  - Deploy = `awecode open web` on the computer + scan QR on the phone.
  - HTTPS via `mkcert` keeps service worker + push available without a real domain.
  - All future agent improvements (tools, workflows, context management) automatically reach mobile.
- **Negative**
  - iOS Safari PWA limitations: no background push, some service-worker quirks, occasional idle-WebSocket drops. We mitigate with auto-reconnect + local notifications and document Android as the reference platform.
  - No App Store presence. If we later want native distribution, we can wrap the same renderer in Capacitor — the PWA architecture is forward-compatible with that path.
  - Computer-tethered: the phone cannot work offline or away from the developer's machine. Inherent to the agent-needs-filesystem constraint, not specific to PWA.
- **Neutral**
  - `@awecode/web` adds ~14 new files (server) + ~5 new files (transport, hooks, mobile-only components). The remaining renderer code is imported from `@awecode/gui` via cross-package imports, not copied.
  - The CLI gains one new subcommand: `awecode open web [--port] [--no-tls] [--mdns]`.

## Non-goals

- No App Store / Play Store distribution for v0.1.
- No offline agent execution on the phone.
- No Web Push (VAPID) background delivery for v0.1.
- No theme switcher (dark only, matching Desktop).

## Follow-ups

- If PWA limitations on iOS become painful, the React renderer + `useAgent` hook + transport client are all reusable inside a Capacitor shell. The decision is reversible without a rewrite.
- If we ever want a standalone mobile app that runs the agent on-device (e.g. for a future cloud-hosted variant), that is a separate project — the PWA does not constrain it.
