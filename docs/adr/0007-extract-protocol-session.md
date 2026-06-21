# Extract ProtocolSession from CLI command

## Status

Accepted (2026-06-21)

## Context

Before this ADR, the body of code that runs one agent conversation and emits `GuiAgentEvent`s lived entirely inside `packages/cli/src/commands/gui.ts:190-324` (`runInternalProtocolServer` + `handlePrompt`). It contains:

- Setup of `liveMessages: ModelMessage[]`, `abortController`, lazy `Orchestrator`
- A call to `runChatLoop` with callbacks that wrap each event in `writeEvent(...)` (NDJSON to stdout)
- `onDiffDetected` spawning the Orchestrator
- Try/catch mapping `AbortError` vs real errors to distinct event shapes
- A `finally` that emits the final `context_snapshot` + `done`

This is ~75 lines of pure **transport adapter** logic: it converts `runChatLoop`'s callback API into an event stream.

When we added the Web/mobile PWA server (`@awecode/web`), the spec initially proposed duplicating these ~75 lines into `ws-bridge.ts`, swapping `writeEvent` (stdout) for `ws.send` (WebSocket). We flagged this as a code-smell during grilling:

- Bug fixes (e.g. the existing potential double-`done` emission) must be applied to two places
- Behavior drift between Desktop and Web is silently possible
- The "transport" concern and the "agent session lifecycle" concern are tangled

We considered three alternatives:

1. **Duplicate.** Accept the 75 lines of duplication. Cheapest in the short term; worst in the long term.
2. **Pure-function adapter** (`adaptRunChatLoopToEvents(...)`). Only moves code, does not encapsulate state (`liveMessages`, `abortController`, `orchestrator`). Each caller still re-implements setup.
3. **New package `@awecode/protocol-server`.** Over-engineered for one file with exactly two consumers.

## Decision

Extract a `ProtocolSession` class into `packages/agent/src/protocol-session.ts` (public API of `@awecode/agent`):

```ts
export interface ProtocolSessionOptions {
  config: AwecodeConfig;
  context: ContextManager;
  cwd: string;
  /** Caller-provided sink. Receives every GuiAgentEvent the session emits. */
  send: (ev: GuiAgentEvent) => void;
  /** Optional override for tests; defaults to the real runChatLoop. */
  runChatLoop?: typeof runChatLoop;
}

export interface ProtocolSession {
  handlePrompt(text: string): Promise<void>;
  abort(): void;
  dispose(): void;
}
```

Internally `ProtocolSession` owns `liveMessages`, `abortController`, lazy `Orchestrator`, and the `pendingAssistant` coalescing logic. It does not know about stdio, WebSocket, or any other transport.

### Refactor scope

1. **`packages/agent/src/protocol-session.ts`** — new file, owns session lifecycle + event emission.
2. **`packages/agent/src/persistence/session-event-handler.ts`** — new pure function `applyEvent(session: Session, ev: GuiAgentEvent): void` extracted from `packages/gui/src/main/index.ts:220-281` (`AgentBridge.handle`). Shared by Desktop and Web so both persist identically.
3. **`packages/cli/src/commands/gui.ts`** — `runInternalProtocolServer` becomes a ~30-line stdio transport: read line → `session.handlePrompt(text)`; bind `session.send` → `process.stdout.write(...)`.
4. **`packages/gui/src/main/index.ts`** — `AgentBridge.handle` delegates to `applyEvent` from `@awecode/agent`.
5. **`packages/web/src/server/ws-bridge.ts`** — ~30-line WebSocket transport: ws.on('message') → `session.handlePrompt`; bind `session.send` → `ws.send`.
6. **`packages/agent/src/chat.ts`** — `runChatLoop` gains `onDone?: () => void` callback. ProtocolSession uses it instead of a try/finally wrapper, so the double-`done` risk is removed for all callers.
7. **`packages/cli/src/commands/chat.tsx`** (TUI) — unchanged, still calls `runChatLoop` directly. Ink is a UI runtime, not a wire transport; ProtocolSession is the wrong abstraction for it.

### Dependency direction

```
                runChatLoop (core loop)
                       ↑
                       │
            ProtocolSession (event sink + state)
                  ↗           ↘
        stdio transport     WebSocket transport
              ↓                     ↓
       gui.ts internal        ws-bridge.ts
              ↓                     ↓
        Electron desktop       Web/mobile PWA
              ↓                     ↓
            AgentBridge        AwecodeClient (browser)
                  ↘           ↗
                  applyEvent (persist to Session JSON)
```

TUI bypasses ProtocolSession because it does not serialize to a wire format — Ink renders directly.

## Consequences

- **Positive**
  - Three callers (Desktop stdio, Web WebSocket, future transport) reuse one agent-session implementation.
  - Bug fixes apply once (e.g. double-`done`, Orchestrator abort handling).
  - Tests can inject a mock `runChatLoop` via `ProtocolSessionOptions` — `ws-bridge.test.ts` and `protocol-session.test.ts` no longer need `vi.mock(...)`.
  - Persistence logic (`applyEvent`) is shared, so Desktop and Web save transcripts identically. No risk of one client persisting a field the other drops.
  - `runChatLoop`'s `onDone` callback makes "loop finished" semantics explicit; callers no longer wrap in try/finally.
- **Negative**
  - Desktop code paths touched by the refactor (risk of regression). Mitigated by existing `ApprovalView.test.tsx`, `ChatView.test.tsx`, and a new `protocol-session.test.ts`.
  - One more export on `@awecode/agent`'s public API surface — permanent commitment to maintain.
- **Neutral**
  - `gui.ts` shrinks from ~325 lines to ~150 (stdio transport only).
  - `AgentBridge.handle` shrinks from ~60 lines to ~5 (delegates to `applyEvent`).

## Non-goals

- Not changing the wire protocol itself (`GuiAgentEvent` / `GuiClientCommand` stay as-is).
- Not changing `runChatLoop`'s core behavior; only adding the `onDone` callback.
- Not forcing the TUI onto ProtocolSession. TUI keeps calling `runChatLoop` directly.

## Follow-ups

- After implementation, the existing potential double-`done` bug (currently masked by client-side idempotency) should be removed as part of the same refactor.
- Once ProtocolSession exists, a follow-up task could add crash-recovery (resume a session from persisted `Session` JSON). Today both Desktop and Web lose in-flight agent state on restart.
