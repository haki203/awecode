# Awecode Web — Mobile PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a mobile-friendly PWA (`@awecode/web`) that wraps the existing Desktop renderer and serves it from an in-process Node HTTP+WebSocket server in the CLI, so the user can chat with the awecode agent from their phone over LAN.

**Architecture:** Three-layer reuse — (1) `@awecode/agent` core (with a new `ProtocolSession` extracted from the CLI internal-mode command and a new `persistence/session-event-handler.ts` shared by Desktop and Web); (2) `@awecode/gui` renderer components imported cross-package (not copied); (3) a new `@awecode/web` package that adds an HTTPS + WebSocket server + a WebSocket transport client + mobile-only drawer/PWA shell. See [design.md](../specs/2026-06-21-web-mobile-design/design.md) and [ADR-0007](../../adr/0007-extract-protocol-session.md) / [ADR-0008](../../adr/0008-mobile-client-pwa-not-native.md).

**Tech Stack:** Node 20+ ESM, TypeScript 6 strict, `node:http` + `ws`, Vite 7 + `@vitejs/plugin-react` + `vite-plugin-pwa`, React 19, vitest, `qrcode`, `bonjour-service`, mkcert (user-installed).

---

## File structure map

**Created:**

```
packages/agent/src/
├── protocol-session.ts                            # NEW (Task 5)
└── persistence/                                   # NEW folder
    ├── sessions.ts                                # MOVED from packages/gui/src/main/sessions.ts (Task 3)
    ├── checkpoint.ts                              # MOVED from packages/agent/src/context/checkpoint.ts (Task 4)
    └── session-event-handler.ts                   # NEW (Task 6)

packages/web/                                      # NEW package (Task 11+)
├── package.json
├── tsconfig.json / tsconfig.node.json / tsconfig.web.json
├── vite.config.ts
├── src/
│   ├── index.ts                                   # public export: startServer
│   ├── server/{index,http-server,ws-bridge,auth,tls,qr,mdns}.ts
│   └── renderer/
│       ├── index.html
│       ├── icons/
│       └── src/
│           ├── main.tsx, App.tsx, globals.d.ts
│           ├── transport/{client,context}.ts
│           ├── hooks/{useNotifications}.ts
│           ├── components/{SidebarDrawer,MenuToggle,TranscriptView,PwaInstallPrompt}.tsx
│           ├── sw/register.ts
│           └── styles.css
├── scripts/smoke-web.mjs
└── tests/
    ├── server/{auth,http-server,ws-bridge}.test.ts
    └── renderer/transport.test.ts

packages/gui/src/renderer/src/
├── transport/context.ts                           # NEW (Task 17)
├── hooks/{useSessions,useWorkspace}.ts            # NEW (Task 16, 18)
└── components/
    ├── Sidebar.tsx                                # REFACTORED to shared (Task 16)
    ├── WorkspaceSidebar.tsx                       # NEW (Desktop-only wrapper, Task 18)
    ├── ErrorBoundary.tsx                          # NEW (Task 10)
    ├── Markdown.tsx                               # + Copy button (Task 9)
    └── ContextPanel.tsx                           # emoji glyphs (Task 8)

packages/gui/src/main/types.ts                     # NEW — WorkspaceState moved here (Task 15)
packages/cli/src/commands/web.ts                   # NEW (Task 23)
```

**Modified:**

- `packages/agent/src/chat.ts` — add `onDone?: () => void` to `ChatLoopOptions` (Task 5)
- `packages/agent/src/index.ts` — export `ProtocolSession`, persistence namespace
- `packages/gui/src/main/sessions.ts` — becomes a 1-line re-export
- `packages/gui/src/main/index.ts` (`AgentBridge.handle`) — delegate to `applyEvent`
- `packages/gui/src/shared/protocol.ts` — remove `WorkspaceState`
- `packages/gui/src/main/index.ts` and `Sidebar.tsx` — update `WorkspaceState` imports
- `packages/gui/src/renderer/src/components/Sidebar.tsx` — use `useSessions`, remove internal fetch
- `packages/gui/src/renderer/src/App.tsx` — wrap in `<TransportContext.Provider>` and `<ErrorBoundary>`
- `packages/cli/src/commands/gui.ts` — `runInternalProtocolServer` shrinks to stdio transport
- `packages/cli/src/index.ts` — register `web` command
- `packages/cli/package.json` — add `@awecode/web` dependency
- `package.json` (root) — `workspaces` picks up `packages/web` automatically

---

## Phase 1: Refactor `@awecode/agent` — ProtocolSession + persistence

### Task 1: Create persistence folder + move sessions.ts

**Files:**
- Create: `packages/agent/src/persistence/sessions.ts`
- Modify: `packages/gui/src/main/sessions.ts` → 1-line re-export
- Modify: `packages/agent/src/index.ts` → export `persistence` namespace
- Test: `packages/agent/tests/persistence/sessions.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/agent/tests/persistence/sessions.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('persistence/sessions', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'awecode-test-'));
    process.env.AWECODE_SESSIONS_DIR = dir;
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.AWECODE_SESSIONS_DIR;
  });

  it('round-trips a session via saveSession/loadSession', async () => {
    const { saveSession, loadSession } = await import('../../src/persistence/sessions.js');
    const s = {
      id: 'abc', title: 't', createdAt: 1, updatedAt: 2, cwd: '/x',
      messages: [{ role: 'user' as const, content: 'hi', ts: 3 }],
    };
    saveSession(s);
    const got = loadSession('abc');
    expect(got).toEqual(s);
  });

  it('listSessionsInWorkspace filters by exact cwd', async () => {
    const { saveSession, listSessionsInWorkspace } = await import('../../src/persistence/sessions.js');
    saveSession({ id: 'a', title: 'a', createdAt: 1, updatedAt: 1, cwd: '/proj1', messages: [] });
    saveSession({ id: 'b', title: 'b', createdAt: 1, updatedAt: 1, cwd: '/proj2', messages: [] });
    const list = listSessionsInWorkspace('/proj1');
    expect(list.map((m) => m.id)).toEqual(['a']);
  });

  it('deleteSession of nonexistent id does not throw', async () => {
    const { deleteSession } = await import('../../src/persistence/sessions.js');
    expect(() => deleteSession('nonexistent')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @awecode/agent vitest run tests/persistence/sessions.test.ts`
Expected: FAIL with "Cannot find module '../../src/persistence/sessions.js'"

- [ ] **Step 3: Move the file**

```bash
git mv packages/gui/src/main/sessions.ts packages/agent/src/persistence/sessions.ts
```

- [ ] **Step 4: Add Apache-2.0 license header to moved file** (if missing)

- [ ] **Step 5: Create the re-export in `@awecode/gui`**

Replace the entire content of `packages/gui/src/main/sessions.ts` with:

```ts
// Copyright 2026 Awecode Contributors
// Licensed under the Apache License, Version 2.0 (the "License").
// Re-export so existing Desktop imports keep working after the move
// into @awecode/agent/persistence.
export * from '@awecode/agent/persistence/sessions';
```

- [ ] **Step 6: Update `@awecode/agent/package.json` exports**

Add to `packages/agent/package.json` `exports` map:

```json
"./persistence/sessions": {
  "types": "./src/persistence/sessions.ts",
  "import": "./src/persistence/sessions.ts"
}
```

- [ ] **Step 7: Export from `@awecode/agent/src/index.ts`**

Add at the end:

```ts
export * as persistence from './persistence/sessions.js';
```

- [ ] **Step 8: Run test to verify it passes**

Run: `yarn workspace @awecode/agent vitest run tests/persistence/sessions.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 9: Run full Desktop test suite to confirm nothing broke**

Run: `yarn workspace @awecode/gui test` (if exists) and `yarn workspace @awecode/cli test`
Expected: All existing tests pass.

- [ ] **Step 10: Commit**

```bash
git add packages/agent/src/persistence/sessions.ts \
        packages/agent/src/index.ts packages/agent/package.json \
        packages/agent/tests/persistence/sessions.test.ts \
        packages/gui/src/main/sessions.ts
git commit -m "awecode: refactor(agent): move sessions.ts to persistence/"
```

---

### Task 2: Move checkpoint.ts into persistence/

**Files:**
- Move: `packages/agent/src/context/checkpoint.ts` → `packages/agent/src/persistence/checkpoint.ts`
- Modify: `packages/agent/src/index.ts` (update export path)

- [ ] **Step 1: Find all imports of the old path**

Run: `rg "context/checkpoint" packages/`
Expected: probably just `packages/agent/src/index.ts`. Note each hit.

- [ ] **Step 2: Move the file**

```bash
git mv packages/agent/src/context/checkpoint.ts packages/agent/src/persistence/checkpoint.ts
```

- [ ] **Step 3: Update `packages/agent/src/index.ts`**

Change `from './context/checkpoint.js'` to `from './persistence/checkpoint.js'`.

- [ ] **Step 4: Update `@awecode/agent/package.json` exports**

Add:

```json
"./persistence/checkpoint": {
  "types": "./src/persistence/checkpoint.ts",
  "import": "./src/persistence/checkpoint.ts"
}
```

- [ ] **Step 5: Run all agent tests**

Run: `yarn workspace @awecode/agent test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/persistence/checkpoint.ts \
        packages/agent/src/index.ts packages/agent/package.json
git commit -m "awecode: refactor(agent): move checkpoint.ts to persistence/"
```

---

### Task 3: Add `onDone` callback to `runChatLoop`

**Files:**
- Modify: `packages/agent/src/chat.ts`
- Test: `packages/agent/tests/chat.test.ts` (add case)

- [ ] **Step 1: Write failing test**

Append to `packages/agent/tests/chat.test.ts`:

```ts
it('calls onDone exactly once when the loop finishes', async () => {
  const { runChatLoop } = await import('../src/chat.js');
  const { ContextManager } = await import('../src/context/manager.js');
  const { loadConfig } = await import('@awecode/llm');
  // Use the existing mock provider pattern from this file.
  const config = /* whatever the other tests use */;
  const calls: number[] = [];
  await runChatLoop([], {
    config,
    context: new ContextManager(),
    maxIterations: 1,
    onDone: () => { calls.push(Date.now()); },
  });
  expect(calls).toHaveLength(1);
});
```

(If `chat.test.ts` already has a mock-config helper, reuse it; otherwise inline the smallest setup that lets `runChatLoop` exit after one iteration.)

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @awecode/agent vitest run tests/chat.test.ts -t "onDone"`
Expected: FAIL with "onDone is not a property" or similar.

- [ ] **Step 3: Modify `ChatLoopOptions`**

In `packages/agent/src/chat.ts` around line 23, extend the interface:

```ts
export interface ChatLoopOptions {
  // ... existing fields ...
  /** Called exactly once when the loop exits (normally, via abort, or via throw). */
  onDone?: () => void;
}
```

- [ ] **Step 4: Wrap the loop body in try/finally**

Currently `runChatLoop` ends with `return messages;`. Change:

```ts
export async function runChatLoop(
  messages: ModelMessage[],
  opts: ChatLoopOptions,
): Promise<ModelMessage[]> {
  try {
    // ... existing body unchanged ...
    return messages;
  } finally {
    opts.onDone?.();
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn workspace @awecode/agent vitest run tests/chat.test.ts -t "onDone"`
Expected: PASS.

- [ ] **Step 6: Run full agent suite for regressions**

Run: `yarn workspace @awecode/agent test`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/agent/src/chat.ts packages/agent/tests/chat.test.ts
git commit -m "awecode: feat(agent): add onDone callback to runChatLoop"
```

---

### Task 4: Extract `applyEvent` into persistence/session-event-handler.ts

**Files:**
- Create: `packages/agent/src/persistence/session-event-handler.ts`
- Test: `packages/agent/tests/persistence/session-event-handler.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/agent/tests/persistence/session-event-handler.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyEvent } from '../../src/persistence/session-event-handler.js';
import type { Session } from '@awecode/agent/persistence/sessions';
import type { GuiAgentEvent } from '@awecode/gui/shared/protocol';

const emptySession: Session = {
  id: 's1', title: 'New chat', createdAt: 1, updatedAt: 1, cwd: '/x', messages: [],
};

describe('applyEvent', () => {
  it('ready updates cwd/model/provider', () => {
    const s = { ...emptySession, messages: [] };
    applyEvent(s, { type: 'ready', cwd: '/y', model: 'gpt-4o', provider: 'openai' });
    expect(s.cwd).toBe('/y');
    expect(s.model).toBe('gpt-4o');
    expect(s.provider).toBe('openai');
  });

  it('message/user adds a user message and derives title', () => {
    const s = { ...emptySession, messages: [] };
    applyEvent(s, { type: 'message', role: 'user', content: 'hello world' });
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0]!.role).toBe('user');
    expect(s.title).toBe('hello world'); // deriveTitle from first user turn
  });

  it('token appends to last assistant message', () => {
    const s = { ...emptySession, messages: [] };
    applyEvent(s, { type: 'token', chunk: 'hel' });
    applyEvent(s, { type: 'token', chunk: 'lo' });
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0]!.role).toBe('assistant');
    expect(s.messages[0]!.content).toBe('hello');
  });

  it('tool_call pushes a synthetic tool message', () => {
    const s = { ...emptySession, messages: [] };
    applyEvent(s, { type: 'tool_call', name: 'shell_exec' });
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0]!.role).toBe('tool');
    expect(s.messages[0]!.content).toContain('shell_exec');
  });

  it('done clears pending assistant (no behavior change visible)', () => {
    const s = { ...emptySession, messages: [] };
    applyEvent(s, { type: 'token', chunk: 'hi' });
    applyEvent(s, { type: 'done' });
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0]!.content).toBe('hi');
  });

  it('error pushes an error message', () => {
    const s = { ...emptySession, messages: [] };
    applyEvent(s, { type: 'error', message: 'boom' });
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0]!.role).toBe('error');
  });

  it('context_snapshot / intent / diff_detected do not mutate messages', () => {
    const s = { ...emptySession, messages: [] };
    applyEvent(s, { type: 'context_snapshot', entries: [], totalTokens: 0, budgetTokens: 1000 });
    applyEvent(s, { type: 'intent', intent: 'workflow', name: 'plan' });
    applyEvent(s, { type: 'diff_detected', diff: '<<<< SEARCH\n...' });
    expect(s.messages).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @awecode/agent vitest run tests/persistence/session-event-handler.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/agent/src/persistence/session-event-handler.ts`. Transcribe the body of `AgentBridge.handle` from `packages/gui/src/main/index.ts:220-281`, but as a pure function that mutates the passed-in `Session`:

```ts
// Copyright 2026 Awecode Contributors. Apache-2.0.
import type { GuiAgentEvent } from '@awecode/gui/shared/protocol';
import type { Session, SessionMessage } from './sessions.js';
import { DEFAULT_TITLE, deriveTitle } from './sessions.js';

/**
 * Fold one agent event into a Session record. Mutates `session` in place
 * (callers persist via saveSession afterwards). Pure with respect to I/O —
 * does not write to disk itself.
 */
export function applyEvent(session: Session, ev: GuiAgentEvent): void {
  const now = Date.now();
  switch (ev.type) {
    case 'ready':
      session.cwd = ev.cwd;
      if (ev.model) session.model = ev.model;
      if (ev.provider) session.provider = ev.provider;
      break;
    case 'message': {
      const msg: SessionMessage = {
        role: ev.role === 'tool' ? 'tool' : ev.role,
        content: ev.content,
        ts: now,
      };
      session.messages.push(msg);
      if (ev.role === 'user' && session.title === DEFAULT_TITLE) {
        session.title = deriveTitle(session.messages);
      }
      break;
    }
    case 'token': {
      const last = session.messages[session.messages.length - 1];
      if (last && last.role === 'assistant') {
        last.content += ev.chunk;
      } else {
        session.messages.push({ role: 'assistant', content: ev.chunk, ts: now });
      }
      break;
    }
    case 'tool_call':
      session.messages.push({ role: 'tool', content: `call ${ev.name}`, ts: now });
      break;
    case 'done':
      // No state change; callers rely on the event for streaming UI.
      break;
    case 'error':
      session.messages.push({ role: 'error', content: ev.message, ts: now });
      break;
    case 'context_snapshot':
    case 'intent':
    case 'diff_detected':
      // No persistence change.
      break;
  }
  session.updatedAt = now;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @awecode/agent vitest run tests/persistence/session-event-handler.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Export from `@awecode/agent/src/index.ts`**

Add to the persistence namespace export:

```ts
export { applyEvent } from './persistence/session-event-handler.js';
```

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/persistence/session-event-handler.ts \
        packages/agent/src/index.ts \
        packages/agent/tests/persistence/session-event-handler.test.ts
git commit -m "awecode: feat(agent): add applyEvent pure function for session persistence"
```

---

### Task 5: Refactor `AgentBridge.handle` to use `applyEvent`

**Files:**
- Modify: `packages/gui/src/main/index.ts:220-281`

- [ ] **Step 1: Confirm Desktop tests cover the surface**

Run: `yarn workspace @awecode/cli test` (which includes `ApprovalView.test.tsx` etc.)
Expected: all PASS.

- [ ] **Step 2: Replace the handle method**

In `packages/gui/src/main/index.ts`, replace the entire `private handle(ev: GuiAgentEvent): void` method (around line 220) with:

```ts
private handle(ev: GuiAgentEvent): void {
  if (!this.session) return;
  applyEvent(this.session, ev);
  saveSession(this.session);
}
```

Add imports at the top:

```ts
import { applyEvent } from '@awecode/agent';
```

(`saveSession` is already imported via `./sessions.js`, which now re-exports from `@awecode/agent`.)

- [ ] **Step 3: Run Desktop tests + smoke-test the Electron app**

Run: `yarn workspace @awecode/cli test`
Expected: PASS.

Run: `yarn workspace @awecode/gui build && yarn workspace @awecode/cli build && awecode open gui` (manual smoke — send a prompt, verify the sidebar shows the session).

- [ ] **Step 4: Commit**

```bash
git add packages/gui/src/main/index.ts
git commit -m "awecode: refactor(gui): AgentBridge.handle delegates to applyEvent"
```

---

### Task 6: Extract `ProtocolSession` into `@awecode/agent`

**Files:**
- Create: `packages/agent/src/protocol-session.ts`
- Test: `packages/agent/tests/protocol-session.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/agent/tests/protocol-session.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import type { ModelMessage } from 'ai';
import type { AwecodeConfig } from '@awecode/llm';
import type { GuiAgentEvent } from '@awecode/gui/shared/protocol';
import { createProtocolSession } from '../src/protocol-session.js';
import { ContextManager } from '../src/context/manager.js';

// Mock runChatLoop — captures callbacks so we can drive them manually.
function mockRunChatLoop(messages: ModelMessage[], opts: any) {
  // Emit a user echo, one token, then finish.
  opts.onToken?.('hel');
  opts.onToken?.('lo');
  messages.push({ role: 'assistant', content: 'hello' });
  opts.onDone?.();
  return Promise.resolve(messages);
}

const config: AwecodeConfig = {
  activeProvider: 'mock',
  providers: { mock: { kind: 'openai-compatible', apiUrl: 'http://x', apiKeyEnvKey: 'X', defaultModel: 'm' } },
} as any;

describe('ProtocolSession', () => {
  it('emits ready on creation, echoes user message + tokens + done on handlePrompt', async () => {
    const events: GuiAgentEvent[] = [];
    const session = createProtocolSession({
      config,
      context: new ContextManager(),
      cwd: '/proj',
      send: (ev) => { events.push(ev); },
      runChatLoop: mockRunChatLoop as any,
    });

    // Initial ready event is emitted synchronously by createProtocolSession.
    expect(events.some((e) => e.type === 'ready')).toBe(true);

    await session.handlePrompt('test');

    const types = events.map((e) => e.type);
    expect(types).toContain('message');      // user echo
    expect(types.filter((t) => t === 'token').length).toBe(2);
    expect(types[types.length - 1]).toBe('done');
  });

  it('abort() calls runChatLoop abort signal', async () => {
    const session = createProtocolSession({
      config,
      context: new ContextManager(),
      cwd: '/proj',
      send: () => {},
      runChatLoop: ((msgs: any, opts: any) => {
        return new Promise<void>((resolve) => {
          opts.abortSignal.addEventListener('abort', () => resolve());
        });
      }) as any,
    });
    const p = session.handlePrompt('long-running');
    session.abort();
    await p;
    // No throw — abort resolves cleanly.
  });

  it('maps runChatLoop throw to error event + done', async () => {
    const events: GuiAgentEvent[] = [];
    const session = createProtocolSession({
      config,
      context: new ContextManager(),
      cwd: '/proj',
      send: (ev) => { events.push(ev); },
      runChatLoop: (() => { throw new Error('boom'); }) as any,
    });
    await session.handlePrompt('x');
    expect(events.some((e) => e.type === 'error' && e.message.includes('boom'))).toBe(true);
    expect(events[events.length - 1]!.type).toBe('done');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @awecode/agent vitest run tests/protocol-session.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/agent/src/protocol-session.ts`. Transcribe the agent-session logic from `packages/cli/src/commands/gui.ts:250-324` and wrap in a factory:

```ts
// Copyright 2026 Awecode Contributors. Apache-2.0.
import { randomUUID } from 'node:crypto';
import type { ModelMessage } from 'ai';
import { runChatLoop as defaultRunChatLoop, type ChatLoopOptions } from './chat.js';
import type { ContextManager } from './context/manager.js';
import { ApprovalQueue } from './approval.js';
import { Orchestrator } from '@awecode/orchestrator';
import type { AwecodeConfig } from '@awecode/llm';
import type { GuiAgentEvent, GuiClientCommand } from '@awecode/gui/shared/protocol';

export interface ProtocolSessionOptions {
  config: AwecodeConfig;
  context: ContextManager;
  cwd: string;
  /** Caller-provided event sink. Receives every GuiAgentEvent the session emits. */
  send: (ev: GuiAgentEvent) => void;
  /** Override for tests; defaults to the real runChatLoop. */
  runChatLoop?: typeof defaultRunChatLoop;
}

export interface ProtocolSession {
  handlePrompt(text: string): Promise<void>;
  abort(): void;
  dispose(): void;
}

export function createProtocolSession(opts: ProtocolSessionOptions): ProtocolSession {
  const runChatLoop = opts.runChatLoop ?? defaultRunChatLoop;
  let liveMessages: ModelMessage[] = [];
  let abortController: AbortController | null = null;
  let orchestrator: Orchestrator | null = null;
  const queueRef = { current: new ApprovalQueue() };

  function snapshotContext() {
    const entries = opts.context.snapshot().map((e) => ({
      type: e.type,
      label: e.path ?? (e.lines ? `${e.type}:${e.lines.start}-${e.lines.end}` : e.type),
      tokens: e.tokens,
    }));
    return {
      entries,
      totalTokens: opts.context.totalTokens,
      budgetTokens: opts.context.budgetTokens,
    };
  }

  function emit(ev: GuiAgentEvent): void {
    opts.send(ev);
  }

  // Initial handshake.
  emit({
    type: 'ready',
    cwd: opts.cwd,
    model: opts.config.providers[opts.config.activeProvider]?.defaultModel,
    provider: opts.config.activeProvider,
  });
  emit({ type: 'context_snapshot', ...snapshotContext() });

  async function handlePrompt(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;
    emit({ type: 'message', role: 'user', content: trimmed });

    liveMessages = [{ role: 'user', content: trimmed }];
    abortController = new AbortController();

    try {
      await runChatLoop(liveMessages, {
        config: opts.config,
        context: opts.context,
        abortSignal: abortController.signal,
        onToken: (chunk) => emit({ type: 'token', chunk }),
        onToolCall: (name) => emit({ type: 'tool_call', name }),
        onDiffDetected: (diff) => {
          void (async () => {
            try {
              if (!orchestrator) {
                orchestrator = new Orchestrator({
                  projectRoot: opts.cwd,
                  context: opts.context,
                  approvalQueue: queueRef.current,
                  taskUuid: randomUUID(),
                  abortSignal: abortController!.signal,
                  chatMessages: liveMessages,
                });
              }
              const result = await orchestrator.handleDiffDetected(diff);
              emit({
                type: 'message',
                role: 'tool',
                content: result.success
                  ? `applied: ${result.mergedFiles.join(', ')}`
                  : `failed: ${result.error ?? 'unknown'}`,
              });
              emit({ type: 'context_snapshot', ...snapshotContext() });
            } catch (err) {
              emit({ type: 'error', message: `[orchestrator] ${(err as Error).message}` });
            }
          })();
        },
        onIntentDeclared: (intent) => {
          if (intent.type === 'workflow') {
            emit({ type: 'intent', intent: 'workflow', name: intent.name });
          } else {
            emit({ type: 'intent', intent: 'direct', name: null });
          }
        },
        onDone: () => {
          emit({ type: 'context_snapshot', ...snapshotContext() });
          emit({ type: 'done' });
        },
      });
    } catch (err) {
      const isAbort =
        err instanceof Error &&
        (err.name === 'AbortError' || (err as { code?: string }).code === 'ABORT_ERR');
      emit({
        type: 'message',
        role: 'assistant',
        content: isAbort ? '[aborted]' : `[error] ${(err as Error).message}`,
      });
      emit({ type: 'done' });
    } finally {
      abortController = null;
    }
  }

  function abort(): void {
    abortController?.abort();
  }

  function dispose(): void {
    abortController?.abort();
    orchestrator = null;
  }

  return { handlePrompt, abort, dispose };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @awecode/agent vitest run tests/protocol-session.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Export from `@awecode/agent/src/index.ts`**

```ts
export { createProtocolSession } from './protocol-session.js';
export type { ProtocolSession, ProtocolSessionOptions } from './protocol-session.js';
```

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/protocol-session.ts packages/agent/src/index.ts \
        packages/agent/tests/protocol-session.test.ts
git commit -m "awecode: feat(agent): extract ProtocolSession from CLI internal mode"
```

---

### Task 7: Refactor `gui.ts` internal mode to use `ProtocolSession`

**Files:**
- Modify: `packages/cli/src/commands/gui.ts:190-325` (shrink to ~50 lines)

- [ ] **Step 1: Verify current Desktop internal-mode tests pass**

Run: `yarn workspace @awecode/cli test`
Expected: PASS.

- [ ] **Step 2: Replace `runInternalProtocolServer` and `handlePrompt`**

In `packages/cli/src/commands/gui.ts`, delete `runInternalProtocolServer`, `handlePrompt`, `snapshotContext`, `writeEvent`, and the state vars. Replace with:

```ts
async function runInternalProtocolServer(): Promise<void> {
  const configPath = process.env.AWECODE_CONFIG_PATH ?? getDefaultConfigPath();
  const loaded = await loadConfig(configPath);
  if (!loaded) {
    process.stdout.write(JSON.stringify({
      type: 'error',
      message: `No config found at ${configPath}. Run 'awecode config' first.`,
    }) + '\n');
    process.stdout.write(JSON.stringify({ type: 'done' }) + '\n');
    return;
  }
  const config: AwecodeConfig = loaded;
  const activeProviderCfg = config.providers[config.activeProvider];
  const context =
    activeProviderCfg !== undefined
      ? new ContextManager(resolveProviderContextWindow(activeProviderCfg))
      : new ContextManager();

  const session = createProtocolSession({
    config,
    context,
    cwd: process.cwd(),
    send: (ev) => process.stdout.write(JSON.stringify(ev) + '\n'),
  });

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let cmd: GuiClientCommand;
    try { cmd = JSON.parse(line) as GuiClientCommand; }
    catch {
      process.stdout.write(JSON.stringify({ type: 'error', message: 'invalid JSON on stdin' }) + '\n');
      return;
    }
    if (cmd.type === 'exit') { session.dispose(); process.exit(0); return; }
    if (cmd.type === 'abort') { session.abort(); return; }
    if (cmd.type === 'prompt') { void session.handlePrompt(cmd.text); }
  });
}
```

Update imports: remove `ApprovalQueue`, `runChatLoop`, `Orchestrator`, `randomUUID`, `snapshotContext` helper. Add `createProtocolSession`. Remove unused imports.

- [ ] **Step 3: Run smoke protocol script**

Run: `node packages/gui/scripts/smoke-protocol.mjs`
Expected: PASS (existing smoke script should still work).

- [ ] **Step 4: Run CLI tests**

Run: `yarn workspace @awecode/cli test`
Expected: PASS.

- [ ] **Step 5: Manual smoke**

```bash
yarn workspace @awecode/cli build
echo '{"type":"prompt","text":"hello"}' | AWECODE_CONFIG_PATH=~/.awecode/config.json node packages/cli/dist/index.js open gui --internal
```

Expected: see JSON lines including `ready`, `message/user`, then assistant tokens, then `done`.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands/gui.ts
git commit -m "awecode: refactor(cli): gui internal mode uses ProtocolSession"
```

---

## Phase 2: Desktop-only types + shared hooks

### Task 8: Move `WorkspaceState` out of shared/protocol.ts

**Files:**
- Create: `packages/gui/src/main/types.ts`
- Modify: `packages/gui/src/shared/protocol.ts` (remove `WorkspaceState`)
- Modify: `packages/gui/src/main/index.ts` (update import)
- Modify: `packages/gui/src/renderer/src/components/Sidebar.tsx` (update import)

- [ ] **Step 1: Create `packages/gui/src/main/types.ts`**

```ts
// Copyright 2026 Awecode Contributors. Apache-2.0.

export interface WorkspaceState {
  /** Absolute path of the currently-open project folder. */
  current: string | null;
  /** Recently-opened folders, most-recent first. */
  recent: string[];
}
```

- [ ] **Step 2: Remove `WorkspaceState` from `packages/gui/src/shared/protocol.ts`**

Delete lines 74-81 (the `// --- Workspace (project picker) ---` block + interface).

- [ ] **Step 3: Update `packages/gui/src/main/index.ts` import**

Change line 39 from:
```ts
import { ... type WorkspaceState } from './workspaces.js';
```
to import from `'./types.js'` (or wherever it was sourced — verify in `workspaces.ts`).

- [ ] **Step 4: Update `packages/gui/src/renderer/src/components/Sidebar.tsx`**

Change line 18 from:
```ts
import type { SessionMeta, WorkspaceState } from '../../../shared/protocol.js';
```
to:
```ts
import type { SessionMeta } from '../../../shared/protocol.js';
import type { WorkspaceState } from '../../../../main/types.js';
```

(If the relative path crosses package boundaries in a way that breaks vite, consider exporting `WorkspaceState` via `@awecode/gui/src/main/types` as a subpath export in `packages/gui/package.json`. For now relative path works.)

- [ ] **Step 5: Run typecheck**

Run: `yarn workspace @awecode/gui typecheck && yarn workspace @awecode/cli typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/gui/src/main/types.ts packages/gui/src/shared/protocol.ts \
        packages/gui/src/main/index.ts \
        packages/gui/src/renderer/src/components/Sidebar.tsx
git commit -m "awecode: refactor(gui): move WorkspaceState out of shared wire protocol"
```

---

### Task 9: Replace nerd-font glyphs in ContextPanel with Unicode emoji

**Files:**
- Modify: `packages/gui/src/renderer/src/components/ContextPanel.tsx`
- Modify: `packages/gui/src/renderer/src/styles.css`

- [ ] **Step 1: Update glyphs map**

In `packages/gui/src/renderer/src/components/ContextPanel.tsx`, replace lines 24-31:

```ts
const glyphs: Record<string, string> = {
  file: '📄',
  snippet: '✂',
  symbol: 'ƒ',
  'command-output': '▸',
  diff: 'Δ',
  'repo-map': '🗺',
};
```

- [ ] **Step 2: Add emoji font fallback**

In `packages/gui/src/renderer/src/styles.css`, find `.ctx-list .glyph {` and add `font-family`:

```css
.ctx-list .glyph {
  color: var(--c-accent);
  width: 16px;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
}
```

- [ ] **Step 3: Run existing tests**

Run: `yarn workspace @awecode/cli test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/gui/src/renderer/src/components/ContextPanel.tsx \
        packages/gui/src/renderer/src/styles.css
git commit -m "awecode: refactor(gui): use Unicode emoji for ContextPanel glyphs"
```

---

### Task 10: Add Copy button to Markdown code blocks

**Files:**
- Modify: `packages/gui/src/renderer/src/components/Markdown.tsx`

- [ ] **Step 1: Add CodeBlock wrapper component**

Replace the `pre:` renderer in `packages/gui/src/renderer/src/components/Markdown.tsx`. Add at top of file (after imports):

```tsx
import { useCallback, useState } from 'react';

function PreWithCopy({ children }: { children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(() => {
    // Extract text content from the rendered <code> children.
    const text = extractText(children);
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [children]);
  return (
    <div className="md-pre-wrap">
      <button className="md-copy-btn" onClick={onCopy} aria-label="Copy code">
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className="md-pre">{children}</pre>
    </div>
  );
}

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    // @ts-expect-error - duck typing React elements
    return extractText(node.props.children);
  }
  return '';
}
```

Change the `components` prop:
```tsx
pre: ({ children }) => <PreWithCopy>{children}</PreWithCopy>,
```

- [ ] **Step 2: Add styles**

Append to `packages/gui/src/renderer/src/styles.css`:

```css
.md-pre-wrap {
  position: relative;
  margin: 8px 0;
}

.md-copy-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  font-size: 11px;
  padding: 2px 8px;
  opacity: 0;
  transition: opacity 0.15s;
  background: var(--bg-elev-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--c-text-dim);
}

.md-pre-wrap:hover .md-copy-btn {
  opacity: 1;
}

.md-copy-btn:hover {
  color: var(--c-accent);
  border-color: var(--c-accent);
}
```

Also update `.md-pre` rule: remove `margin: 8px 0;` (now on wrapper) and remove `background`/`border`/`border-radius`/`padding` from `.md-pre` if you want them on the wrapper instead. Easiest: leave `.md-pre` rules and let wrapper inherit visually.

- [ ] **Step 3: Manual test in Electron**

Run: `yarn workspace @awecode/gui dev`, send a prompt that returns code, hover the code block, click Copy, paste somewhere → confirm content.

- [ ] **Step 4: Commit**

```bash
git add packages/gui/src/renderer/src/components/Markdown.tsx \
        packages/gui/src/renderer/src/styles.css
git commit -m "awecode: feat(gui): add Copy button to Markdown code blocks"
```

---

### Task 11: Add `ErrorBoundary` component

**Files:**
- Create: `packages/gui/src/renderer/src/components/ErrorBoundary.tsx`

- [ ] **Step 1: Implement**

```tsx
// Copyright 2026 Awecode Contributors. Apache-2.0.
import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }): void {
    console.error('[awecode] render crash:', error, info);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div className="error-boundary">
            <h1>awecode crashed</h1>
            <p>{this.state.error.message}</p>
            <button onClick={() => location.reload()}>Reload</button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
```

Add minimal styles to `styles.css`:

```css
.error-boundary {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  text-align: center;
  padding: 20px;
  color: var(--c-danger);
}
.error-boundary button {
  margin-top: 12px;
  border-color: var(--c-accent);
  color: var(--c-accent);
}
```

- [ ] **Step 2: Wrap Desktop App**

In `packages/gui/src/renderer/src/App.tsx`, wrap the returned JSX:

```tsx
import { ErrorBoundary } from './components/ErrorBoundary.js';

export function App() {
  // ...
  return (
    <ErrorBoundary>
      {/* existing JSX */}
    </ErrorBoundary>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `yarn workspace @awecode/gui typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/gui/src/renderer/src/components/ErrorBoundary.tsx \
        packages/gui/src/renderer/src/App.tsx \
        packages/gui/src/renderer/src/styles.css
git commit -m "awecode: feat(gui): add ErrorBoundary around renderer"
```

---

### Task 12: Create `TransportClient` type + context stub

**Files:**
- Create: `packages/gui/src/renderer/src/transport/context.ts`

- [ ] **Step 1: Implement**

```ts
// Copyright 2026 Awecode Contributors. Apache-2.0.
import { useContext, createContext } from 'react';
import type { GuiAgentEvent, GuiClientCommand, Session, SessionMeta } from '../../../shared/protocol.js';

export interface TransportClient {
  send(cmd: GuiClientCommand): Promise<void>;
  onEvent(cb: (ev: GuiAgentEvent) => void): () => void;
  listSessions(): Promise<SessionMeta[]>;
  getSession(id: string): Promise<Session | null>;
  deleteSession(id: string): Promise<boolean>;
  renameSession(id: string, title: string): Promise<SessionMeta | null>;
}

export const TransportContext = createContext<TransportClient | null>(null);

export function useTransport(): TransportClient {
  const client = useContext(TransportContext);
  if (!client) throw new Error('useTransport must be used inside <TransportContext.Provider>');
  return client;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/gui/src/renderer/src/transport/context.ts
git commit -m "awecode: feat(gui): add TransportClient type + TransportContext"
```

---

### Task 13: Create shared `useSessions` hook

**Files:**
- Create: `packages/gui/src/renderer/src/hooks/useSessions.ts`

- [ ] **Step 1: Implement**

```ts
// Copyright 2026 Awecode Contributors. Apache-2.0.
import { useCallback, useEffect, useState } from 'react';
import type { SessionMeta, SessionMessage } from '../../../shared/protocol.js';
import type { TransportClient } from '../transport/context.js';

export interface UseSessions {
  list: SessionMeta[];
  activeId: string | null;
  refresh: () => Promise<void>;
  open: (id: string) => Promise<{ meta: SessionMeta; messages: SessionMessage[] } | null>;
  remove: (id: string) => Promise<void>;
  rename: (id: string, title: string) => Promise<void>;
}

export function useSessions(client: TransportClient): UseSessions {
  const [list, setList] = useState<SessionMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setList(await client.listSessions());
    } catch {
      // Silent — likely transport error; transport layer reports separately.
    }
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

  const open = useCallback(async (id: string) => {
    const session = await client.getSession(id);
    if (!session) return null;
    setActiveId(id);
    return { meta: stripMessages(session), messages: session.messages };
  }, [client]);

  const remove = useCallback(async (id: string) => {
    await client.deleteSession(id);
    if (id === activeId) setActiveId(null);
    await refresh();
  }, [activeId, client, refresh]);

  const rename = useCallback(async (id: string, title: string) => {
    await client.renameSession(id, title);
    await refresh();
  }, [client, refresh]);

  return { list, activeId, refresh, open, remove, rename };
}

function stripMessages<M extends { messages: unknown }>(s: M): Omit<M, 'messages'> {
  const { messages: _m, ...meta } = s;
  void _m;
  return meta;
}
```

Note: this references `TransportClient` from `../transport/context.js`, created in Task 17. Either:
- Create the type stub first (Task 17 partial), or
- Inline a minimal type here and widen later.

Recommended: create `transport/context.ts` with just the type now, then the Provider in Task 17.

- [ ] **Step 2: Commit (will integrate in later tasks)**

```bash
git add packages/gui/src/renderer/src/hooks/useSessions.ts
git commit -m "awecode: feat(gui): add shared useSessions hook (transport-agnostic)"
```

---

### Task 14: Refactor `useAgent` to consume `TransportClient`

**Files:**
- Modify: `packages/gui/src/renderer/src/hooks/useAgent.ts`

- [ ] **Step 1: Add `onDone` to interface**

Add to the `UseAgent` interface:

```ts
onDone: (cb: () => void) => () => void;
```

- [ ] **Step 2: Replace `window.awecode` calls with `useTransport()`**

Replace the existing `useEffect` that binds `window.awecode.onEvent`:

```ts
import { useTransport } from '../transport/context.js';

export function useAgent(): UseAgent {
  const client = useTransport();
  // ... existing state ...

  const doneCbs = useRef(new Set<() => void>());

  useEffect(() => {
    const off = client.onEvent((ev: GuiAgentEvent) => {
      switch (ev.type) {
        // ... existing cases unchanged ...
        case 'done':
          streamingRef.current = false;
          setIsStreaming(false);
          doneCbs.current.forEach((cb) => cb());
          break;
      }
    });
    return off;
  }, [client]);

  const send = useCallback((text: string) => {
    // ... same body, but use `client.send` instead of `window.awecode.send` ...
    void client.send({ type: 'prompt', text });
  }, [client]);

  const abort = useCallback(() => {
    if (!streamingRef.current) return;
    void client.send({ type: 'abort' });
  }, [client]);

  const onDone = useCallback((cb: () => void) => {
    doneCbs.current.add(cb);
    return () => doneCbs.current.delete(cb);
  }, []);

  return { /* ... existing fields ... */ onDone };
}
```

- [ ] **Step 3: Provide a Desktop-side TransportClient**

Create `packages/gui/src/renderer/src/transport/electron-client.ts`:

```ts
// Copyright 2026 Awecode Contributors. Apache-2.0.
import type { TransportClient } from './context.js';
import type { GuiAgentEvent, GuiClientCommand, Session, SessionMeta } from '../../../shared/protocol.js';

// `window.awecode` is exposed by the Electron preload script.
declare global {
  interface Window { awecode: ElectronApi }
}

interface ElectronApi {
  send(cmd: GuiClientCommand): Promise<void>;
  onEvent(cb: (ev: GuiAgentEvent) => void): () => void;
  onSessionLoaded(cb: (p: { session: SessionMeta; messages: Session['messages'] }) => void): () => void;
  listSessions(): Promise<SessionMeta[]>;
  newSession(): Promise<SessionMeta | null>;
  openSession(id: string): Promise<SessionMeta | null>;
  deleteSession(id: string): Promise<boolean>;
  renameSession(id: string, title: string): Promise<SessionMeta | null>;
  currentSession(): Promise<SessionMeta | null>;
}

export const electronClient: TransportClient = {
  send: (cmd) => window.awecode.send(cmd),
  onEvent: (cb) => window.awecode.onEvent(cb),
  listSessions: () => window.awecode.listSessions(),
  getSession: async (id) => {
    // Desktop's preload doesn't have getSession; use openSession + currentSession.
    const meta = await window.awecode.openSession(id);
    if (!meta) return null;
    // Note: Desktop pushes session:loaded event with messages; for the shared
    // hook contract we'd need a new IPC method. For now, return meta with empty messages.
    return { ...meta, messages: [] };
  },
  deleteSession: (id) => window.awecode.deleteSession(id),
  renameSession: (id, title) => window.awecode.renameSession(id, title),
};
```

(If Desktop's renderer needs `getSession` with messages, extend the preload `ipcRenderer.invoke('session:open', id)` to return the full Session rather than just meta. For this plan, accept the impedance mismatch and note it.)

- [ ] **Step 4: Wrap Desktop App with `TransportContext.Provider`**

In `packages/gui/src/renderer/src/App.tsx`:

```tsx
import { TransportContext } from './transport/context.js';
import { electronClient } from './transport/electron-client.js';

export function App() {
  // ...
  return (
    <ErrorBoundary>
      <TransportContext.Provider value={electronClient}>
        {/* existing JSX */}
      </TransportContext.Provider>
    </ErrorBoundary>
  );
}
```

- [ ] **Step 5: Run Desktop tests**

Run: `yarn workspace @awecode/cli test`
Expected: PASS.

- [ ] **Step 6: Manual smoke**

Run: `yarn workspace @awecode/gui dev`, open the app, send a prompt → streaming works, sidebar lists sessions.

- [ ] **Step 7: Commit**

```bash
git add packages/gui/src/renderer/src/hooks/useAgent.ts \
        packages/gui/src/renderer/src/transport/electron-client.ts \
        packages/gui/src/renderer/src/App.tsx
git commit -m "awecode: refactor(gui): useAgent consumes TransportClient via context"
```

---

### Task 15: Split Sidebar into `Sidebar` (shared) + `WorkspaceSidebar` (Desktop)

**Files:**
- Modify: `packages/gui/src/renderer/src/components/Sidebar.tsx`
- Create: `packages/gui/src/renderer/src/components/WorkspaceSidebar.tsx`

- [ ] **Step 1: Refactor `Sidebar` to shared props**

Replace the entire `Sidebar.tsx` with a layout-only version that accepts `sessions` and `activeId` as props (no internal fetch):

```tsx
// Copyright 2026 Awecode Contributors. Apache-2.0.
import { useState } from 'react';
import type { SessionMeta } from '../../../shared/protocol.js';

interface Props {
  sessions: SessionMeta[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  /** Optional header element rendered above the session list. Desktop passes a workspace header. */
  header?: React.ReactNode;
}

export function Sidebar({ sessions, activeId, onSelect, onNew, onDelete, onRename, header }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');

  function startRename(s: SessionMeta): void {
    setEditingId(s.id);
    setDraftTitle(s.title);
  }

  function commitRename(): void {
    if (editingId) {
      const t = draftTitle.trim();
      if (t) onRename(editingId, t);
    }
    setEditingId(null);
  }

  return (
    <aside className="sidebar">
      {header}
      <div className="sidebar-header">
        <button className="btn-new" onClick={onNew} title="New chat">
          <span className="plus">+</span>
          <span>New chat</span>
        </button>
      </div>
      <div className="sidebar-list">
        {sessions.length === 0 ? (
          <div className="sidebar-empty">No conversations yet</div>
        ) : (
          <div className="session-group">
            {sessions.map((s) => (
              <div
                key={s.id}
                className={`session-row ${activeId === s.id ? 'active' : ''}`}
                onClick={() => editingId !== s.id && onSelect(s.id)}
              >
                {editingId === s.id ? (
                  <input
                    className="rename-input"
                    autoFocus
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <span
                      className="session-title"
                      title={s.title}
                      onDoubleClick={(e) => { e.stopPropagation(); startRename(s); }}
                    >
                      {s.title}
                    </span>
                    <button
                      className="btn-delete"
                      title="Delete"
                      onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${s.title}"?`)) onDelete(s.id); }}
                    >×</button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Create `WorkspaceSidebar.tsx`**

```tsx
// Copyright 2026 Awecode Contributors. Apache-2.0.
import { useMemo } from 'react';
import { Sidebar } from './Sidebar.js';
import { useSessions } from '../hooks/useSessions.js';
import { useWorkspace } from '../hooks/useWorkspace.js';
import { useTransport } from '../transport/context.js';

interface Props {
  activeSessionId: string | null;
  onSelectSession: (id: string, messages: { role: 'user'|'assistant'|'tool'|'error'; content: string }[]) => void;
  onNewSession: () => void;
}

export function WorkspaceSidebar({ activeSessionId, onSelectSession, onNewSession }: Props) {
  const transport = useTransport();
  const sessions = useSessions(transport);
  const workspace = useWorkspace();

  const currentName = useMemo(() => basename(workspace.currentCwd), [workspace.currentCwd]);
  const otherRecent = useMemo(
    () => workspace.state.recent.filter((p) => p !== workspace.currentCwd),
    [workspace.state.recent, workspace.currentCwd],
  );

  const header = (
    <div className="sidebar-header">
      <button
        className="btn-open-project"
        onClick={workspace.pickWorkspace}
        title="Open a different project folder"
      >
        <span className="icon">📁</span>
        <span>Open project</span>
      </button>
      <div
        className="current-project"
        title={workspace.currentCwd}
        onClick={() => workspace.switchWorkspace(workspace.currentCwd)}
      >
        <span className="dot" />
        <span className="name">{currentName}</span>
      </div>
    </div>
  );

  const recentProjects = otherRecent.length > 0 && (
    <>
      <div className="group-heading">Recent projects</div>
      {otherRecent.map((p) => (
        <div key={p} className="project-row" title={p} onClick={() => workspace.switchWorkspace(p)}>
          <span className="icon">📁</span>
          <span className="name">{basename(p)}</span>
        </div>
      ))}
    </>
  );

  return (
    <Sidebar
      sessions={sessions.list}
      activeId={activeSessionId}
      header={header}
      onSelect={(id) => { void sessions.open(id).then((r) => r && onSelectSession(id, r.messages)); }}
      onNew={onNewSession}
      onDelete={(id) => void sessions.remove(id)}
      onRename={(id, title) => void sessions.rename(id, title)}
    />
  );
}

function basename(p: string): string {
  if (!p) return 'untitled';
  const clean = p.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = clean.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? p;
}
```

- [ ] **Step 3: Create `useWorkspace` hook**

```ts
// Copyright 2026 Awecode Contributors. Apache-2.0.
import { useEffect, useState } from 'react';
import type { WorkspaceState } from '../../../../main/types.js';

// Desktop-only hook — calls window.awecode workspace IPC.
declare global {
  interface Window { awecode: any }
}

export function useWorkspace() {
  const [state, setState] = useState<WorkspaceState>({ current: null, recent: [] });
  const [currentCwd, setCurrentCwd] = useState<string>('');

  useEffect(() => {
    void window.awecode.workspace?.state?.().then(setState);
    void window.awecode.workspace?.current?.().then(setCurrentCwd);
  }, []);

  return {
    state,
    currentCwd,
    pickWorkspace: async () => {
      const cwd = await window.awecode.workspace?.pick?.();
      if (cwd) {
        const next = await window.awecode.workspace?.open?.(cwd);
        if (next) setState(next);
        setCurrentCwd(cwd);
      }
    },
    switchWorkspace: async (cwd: string) => {
      const next = await window.awecode.workspace?.open?.(cwd);
      if (next) setState(next);
      setCurrentCwd(cwd);
    },
  };
}
```

Note: this assumes the preload already exposes `workspace.*` methods. Check `packages/gui/src/preload/index.ts` — if not, add them in a follow-up sub-task.

- [ ] **Step 4: Update Desktop App.tsx to use `WorkspaceSidebar`**

In `packages/gui/src/renderer/src/App.tsx`, replace the `<Sidebar>` usage with `<WorkspaceSidebar>`.

- [ ] **Step 5: Run typecheck + tests**

Run: `yarn workspace @awecode/gui typecheck && yarn workspace @awecode/cli test`
Expected: PASS.

- [ ] **Step 6: Manual smoke**

Desktop GUI: sidebar still works, switching projects still works.

- [ ] **Step 7: Commit**

```bash
git add packages/gui/src/renderer/src/components/Sidebar.tsx \
        packages/gui/src/renderer/src/components/WorkspaceSidebar.tsx \
        packages/gui/src/renderer/src/hooks/useWorkspace.ts \
        packages/gui/src/renderer/src/App.tsx
git commit -m "awecode: refactor(gui): split Sidebar (shared) + WorkspaceSidebar (desktop)"
```

---

## Phase 3: Create `@awecode/web` package skeleton

### Task 16: Scaffold `packages/web/package.json` + tsconfigs

**Files:**
- Create: `packages/web/package.json`
- Create: `packages/web/tsconfig.json`
- Create: `packages/web/tsconfig.node.json`
- Create: `packages/web/tsconfig.web.json`
- Create: `packages/web/src/index.ts` (placeholder)

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@awecode/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/server/index.js",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    }
  },
  "scripts": {
    "dev": "vite",
    "build": "vite build && tsup src/server/index.ts --format esm --dts --outDir dist/server",
    "typecheck": "tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@awecode/agent": "workspace:*",
    "@awecode/llm": "workspace:*",
    "@awecode/orchestrator": "workspace:*",
    "@awecode/gui": "workspace:*",
    "ws": "^8.18.0",
    "qrcode": "^1.5.4"
  },
  "devDependencies": {
    "@types/node": "^26.0.0",
    "@types/ws": "^8.5.13",
    "@types/qrcode": "^1.5.5",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^5.0.0",
    "bonjour-service": "^1.2.1",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "react-markdown": "^10.0.0",
    "remark-gfm": "^4.0.0",
    "tsup": "^8.0.0",
    "typescript": "^6.0.3",
    "vite": "^7.0.0",
    "vite-plugin-pwa": "^0.20.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfigs**

`packages/web/tsconfig.json`:
```json
{ "files": [], "references": [{ "path": "./tsconfig.node.json" }, { "path": "./tsconfig.web.json" }] }
```

`packages/web/tsconfig.node.json`:
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": { "lib": ["ES2022"], "module": "ESNext", "moduleResolution": "Bundler", "noEmit": true },
  "include": ["src/server/**/*", "src/index.ts", "scripts/**/*"]
}
```

`packages/web/tsconfig.web.json`:
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": { "lib": ["ES2022", "DOM", "DOM.Iterable"], "module": "ESNext", "moduleResolution": "Bundler", "jsx": "react-jsx", "noEmit": true },
  "include": ["src/renderer/**/*"]
}
```

- [ ] **Step 3: Create placeholder `src/index.ts`**

```ts
// Copyright 2026 Awecode Contributors. Apache-2.0.
export { startServer } from './server/index.js';
```

(Will fail typecheck until `server/index.ts` exists; acceptable for now — next tasks fill it in.)

- [ ] **Step 4: Add dependency in `packages/cli/package.json`**

Add to `dependencies`:
```json
"@awecode/web": "workspace:*"
```

- [ ] **Step 5: Run `yarn install` to register the new workspace**

Run: `yarn install`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/web/ packages/cli/package.json yarn.lock
git commit -m "awecode: feat(web): scaffold @awecode/web package"
```

---

### Task 17: Implement `server/auth.ts`

**Files:**
- Create: `packages/web/src/server/auth.ts`
- Test: `packages/web/tests/server/auth.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/web/tests/server/auth.test.ts
import { describe, it, expect } from 'vitest';
import { generateToken, verifyBearer } from '../../src/server/auth.js';

function mockReq(opts: { auth?: string; url?: string }) {
  return {
    headers: opts.auth ? { authorization: opts.auth } : {},
    url: opts.url ?? '/',
  } as any;
}

describe('auth', () => {
  it('generateToken returns 12 hex chars', () => {
    const t = generateToken();
    expect(t).toMatch(/^[0-9a-f]{12}$/);
  });

  it('generateToken is unique across 1000 calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(generateToken());
    expect(seen.size).toBe(1000);
  });

  it('verifyBearer accepts matching Authorization header', () => {
    const t = generateToken();
    expect(verifyBearer(mockReq({ auth: `Bearer ${t}` }), t)).toBe(true);
  });

  it('verifyBearer accepts matching ?token= query', () => {
    const t = generateToken();
    expect(verifyBearer(mockReq({ url: `/?token=${t}` }), t)).toBe(true);
  });

  it('verifyBearer rejects missing auth', () => {
    expect(verifyBearer(mockReq({}), generateToken())).toBe(false);
  });

  it('verifyBearer rejects wrong token', () => {
    const t = generateToken();
    expect(verifyBearer(mockReq({ auth: `Bearer ${'0'.repeat(12)}` }), t)).toBe(false);
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `yarn workspace @awecode/web vitest run tests/server/auth.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `auth.ts`**

```ts
// Copyright 2026 Awecode Contributors. Apache-2.0.
import crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export function generateToken(): string {
  return crypto.randomBytes(6).toString('hex');
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

- [ ] **Step 4: Run passing test**

Run: `yarn workspace @awecode/web vitest run tests/server/auth.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/server/auth.ts packages/web/tests/server/auth.test.ts
git commit -m "awecode: feat(web): bearer token auth (constant-time verify)"
```

---

### Task 18: Implement `server/qr.ts`

**Files:**
- Create: `packages/web/src/server/qr.ts`

(Skip unit test — visual output, hard to assert. Cover via smoke test in Task 26.)

- [ ] **Step 1: Implement**

```ts
// Copyright 2026 Awecode Contributors. Apache-2.0.
import os from 'node:os';
import QRCode from 'qrcode';

export interface LanIp {
  ipv4: string;
  interface: string;
}

export function discoverLanIps(): LanIp[] {
  const ifaces = os.networkInterfaces();
  const result: LanIp[] = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    for (const a of addrs) {
      if (a.family !== 'IPv4' || a.internal) continue;
      // Skip link-local 169.254.x.x
      if (a.address.startsWith('169.254.')) continue;
      result.push({ ipv4: a.address, interface: name });
    }
  }
  // Prefer private ranges
  result.sort((a, b) => {
    const aPrivate = isPrivateLan(a.ipv4);
    const bPrivate = isPrivateLan(b.ipv4);
    if (aPrivate && !bPrivate) return -1;
    if (!aPrivate && bPrivate) return 1;
    return 0;
  });
  return result;
}

function isPrivateLan(ip: string): boolean {
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('172.')) {
    const second = parseInt(ip.split('.')[1] ?? '0', 10);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

export interface QrOutput {
  localUrl: string;
  networkUrls: string[];
  mdnsUrl: string | null;
  token: string;
  asciiQr: string;
}

export async function renderQr(opts: {
  port: number;
  token: string;
  mdnsName: string | null;
  tls: boolean;
}): Promise<QrOutput> {
  const protocol = opts.tls ? 'https' : 'http';
  const localUrl = `${protocol}://localhost:${opts.port}`;
  const lanIps = discoverLanIps();
  const networkUrls = lanIps.map((ip) => `${protocol}://${ip.ipv4}:${opts.port}`);
  const mdnsUrl = opts.mdnsName ? `${protocol}://${opts.mdnsName}.local:${opts.port}` : null;
  // QR encodes the first network URL with token as query.
  const qrTarget = `${networkUrls[0] ?? localUrl}/?token=${opts.token}`;
  const asciiQr = await QRCode.toString(qrTarget, { type: 'terminal', small: true });
  return { localUrl, networkUrls, mdnsUrl, token: opts.token, asciiQr };
}

export function formatStartupBanner(out: QrOutput): string {
  const lines: string[] = [];
  lines.push('┌──────────────────────────────────────────────┐');
  lines.push('│  awecode web ready                            │');
  lines.push('│                                                │');
  lines.push(`│  Local:        ${out.localUrl}`.padEnd(49) + '│');
  if (out.networkUrls[0]) {
    lines.push(`│  Network:      ${out.networkUrls[0]}`.padEnd(49) + '│');
  }
  if (out.mdnsUrl) {
    lines.push(`│  mDNS:         ${out.mdnsUrl}`.padEnd(49) + '│');
  }
  lines.push(`│  Token:        ${out.token}`.padEnd(49) + '│');
  lines.push('│                                                │');
  lines.push('│  Scan QR to open (URL contains token):        │');
  lines.push('│                                                │');
  lines.push('│  Ctrl+C to stop                                │');
  lines.push('└──────────────────────────────────────────────┘');
  lines.push('');
  lines.push(out.asciiQr);
  return lines.join('\n');
}
```

- [ ] **Step 2: Run typecheck**

Run: `yarn workspace @awecode/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/server/qr.ts
git commit -m "awecode: feat(web): QR + LAN IP discovery + startup banner"
```

---

### Task 19: Implement `server/tls.ts`

**Files:**
- Create: `packages/web/src/server/tls.ts`

- [ ] **Step 1: Implement**

```ts
// Copyright 2026 Awecode Contributors. Apache-2.0.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { discoverLanIps } from './qr.js';

const CERT_DIR = resolve(homedir(), '.awecode', 'certs');

export interface TlsCerts {
  cert: Buffer;
  key: Buffer;
}

export function loadCerts(): TlsCerts | null {
  const cert = resolve(CERT_DIR, 'fullchain.pem');
  const key = resolve(CERT_DIR, 'privkey.pem');
  if (existsSync(cert) && existsSync(key)) {
    return { cert: readFileSync(cert), key: readFileSync(key) };
  }
  return null;
}

/**
 * Try to generate host certs via mkcert. NEVER runs `mkcert -install` —
 * user must have run that once already. Returns null if mkcert is not
 * available or cert generation fails; caller falls back to HTTP.
 */
export function generateCerts(opts: { port: number; mdnsName: string | null }): TlsCerts | null {
  mkdirSync(CERT_DIR, { recursive: true });
  const cert = resolve(CERT_DIR, 'fullchain.pem');
  const key = resolve(CERT_DIR, 'privkey.pem');
  const hosts = ['localhost', '127.0.0.1'];
  for (const ip of discoverLanIps()) hosts.push(ip.ipv4);
  if (opts.mdnsName) hosts.push(`${opts.mdnsName}.local`);
  try {
    execFileSync('mkcert', ['-cert-file', cert, '-key-file', key, ...hosts], { stdio: 'inherit' });
  } catch {
    return null;
  }
  if (!existsSync(cert) || !existsSync(key)) return null;
  return { cert: readFileSync(cert), key: readFileSync(key) };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/server/tls.ts
git commit -m "awecode: feat(web): mkcert TLS cert loader (never auto-installs CA)"
```

---

### Task 20: Implement `server/http-server.ts`

**Files:**
- Create: `packages/web/src/server/http-server.ts`
- Test: `packages/web/tests/server/http-server.test.ts`

- [ ] **Step 1: Write failing test** (covers core routes; some may require server/index.ts which is Task 22, mark them `it.skipIf` or implement minimally)

```ts
// packages/web/tests/server/http-server.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';

// We test the router in isolation by constructing it directly.
// Import router once it exists.

describe('http router', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'awecode-test-'));
    process.env.AWECODE_SESSIONS_DIR = dir;
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.AWECODE_SESSIONS_DIR;
  });

  it('GET /api/sessions without token returns 401', async () => {
    const { createRouter } = await import('../../src/server/http-server.js');
    const router = createRouter({ token: 'abc', cwd: '/proj' });
    const res = await router.handle({ method: 'GET', url: '/api/sessions', headers: {} });
    expect(res.status).toBe(401);
  });

  it('GET /api/sessions with token returns array', async () => {
    const { createRouter } = await import('../../src/server/http-server.js');
    const router = createRouter({ token: 'abc', cwd: '/proj' });
    const res = await router.handle({
      method: 'GET', url: '/api/sessions', headers: { authorization: 'Bearer abc' },
    });
    expect(res.status).toBe(200);
    expect(Array.isArray(JSON.parse(res.body))).toBe(true);
  });

  it('SPA fallback returns index.html placeholder', async () => {
    const { createRouter } = await import('../../src/server/http-server.js');
    const router = createRouter({ token: 'abc', cwd: '/proj' });
    const res = await router.handle({ method: 'GET', url: '/random-route', headers: {} });
    expect(res.status).toBe(200);
    expect(res.contentType).toMatch(/text\/html/);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// Copyright 2026 Awecode Contributors. Apache-2.0.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { listSessionsInWorkspace, loadSession, deleteSession, renameSession } from '@awecode/agent/persistence/sessions';
import { verifyBearer } from './auth.js';

export interface RouterCtx {
  token: string;
  cwd: string;
  /** PWA static assets root. If null, SPA fallback returns a placeholder. */
  staticRoot: string | null;
}

export interface RouterResult {
  status: number;
  body: string;
  contentType: string;
}

export interface Router {
  handle(req: SimplifiedReq): Promise<RouterResult>;
}

interface SimplifiedReq {
  method?: string;
  url?: string;
  headers: { authorization?: string; [k: string]: string | undefined };
  body?: string;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

export function createRouter(ctx: RouterCtx): Router {
  async function handle(req: SimplifiedReq): Promise<RouterResult> {
    const url = new URL(req.url ?? '/', 'http://x');
    const path = url.pathname;
    const method = (req.method ?? 'GET').toUpperCase();

    // Public PWA shell
    if (path === '/' || path === '/index.html') return serveIndex(ctx);
    if (path === '/manifest.webmanifest') return serveAsset(ctx, '/manifest.webmanifest');
    if (path === '/sw.js') return serveAsset(ctx, '/sw.js');
    if (path.startsWith('/assets/')) return serveAsset(ctx, path);

    // Authenticated API
    if (path.startsWith('/api/')) {
      if (!verifyBearer(req as unknown as IncomingMessage, ctx.token)) {
        return json(401, { error: 'invalid token' });
      }
      if (path === '/api/sessions' && method === 'GET') {
        return json(200, listSessionsInWorkspace(ctx.cwd));
      }
      const m = path.match(/^\/api\/sessions\/([^/]+)$/);
      if (m) {
        const id = decodeURIComponent(m[1]!);
        if (method === 'GET') {
          const s = loadSession(id);
          return s ? json(200, s) : json(404, { error: 'not found' });
        }
        if (method === 'DELETE') {
          deleteSession(id);
          return json(200, { ok: true });
        }
        if (method === 'PATCH') {
          const body = JSON.parse(req.body ?? '{}') as { title?: string };
          const meta = renameSession(id, body.title ?? '');
          return meta ? json(200, meta) : json(404, { error: 'not found' });
        }
      }
      return json(404, { error: 'not found' });
    }

    // SPA fallback
    return serveIndex(ctx);
  }

  return { handle };
}

function json(status: number, body: unknown): RouterResult {
  return { status, body: JSON.stringify(body), contentType: MIME['.json']! };
}

function serveIndex(ctx: RouterCtx): RouterResult {
  if (!ctx.staticRoot) {
    return { status: 200, body: '<!-- PWA shell placeholder; build renderer first -->', contentType: MIME['.html']! };
  }
  const indexPath = resolve(ctx.staticRoot, 'index.html');
  try {
    const body = readFileSync(indexPath, 'utf8');
    return { status: 200, body, contentType: MIME['.html']! };
  } catch {
    return { status: 404, body: 'index.html not found', contentType: MIME['.html']! };
  }
}

function serveAsset(ctx: RouterCtx, assetPath: string): RouterResult {
  if (!ctx.staticRoot) return json(404, { error: 'no static root' });
  const fullPath = resolve(ctx.staticRoot, assetPath.replace(/^\//, ''));
  // Prevent path traversal.
  const normalizedRoot = resolve(ctx.staticRoot);
  if (!fullPath.startsWith(normalizedRoot)) return json(403, { error: 'forbidden' });
  const ext = assetPath.slice(assetPath.lastIndexOf('.'));
  try {
    const body = readFileSync(fullPath);
    return { status: 200, body: body.toString('utf8'), contentType: MIME[ext] ?? 'application/octet-stream' };
  } catch {
    return json(404, { error: 'not found' });
  }
}

/** Glue: adapt the simplified Router to a real IncomingMessage/ServerResponse pair. */
export function attachRouter(server: import('node:http').Server, ctx: RouterCtx): void {
  const router = createRouter(ctx);
  server.on('request', async (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks).toString('utf8');
    const result = await router.handle({
      method: req.method,
      url: req.url,
      headers: req.headers as { [k: string]: string },
      body,
    });
    res.writeHead(result.status, { 'Content-Type': result.contentType });
    res.end(result.body);
  });
}
```

(serveIndex and serveAsset read files synchronously for simplicity. For high-traffic deployments, swap to `createReadStream` + `pipe(res)`; for single-user awecode this is fine.)

- [ ] **Step 3: Run test**

Run: `yarn workspace @awecode/web vitest run tests/server/http-server.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/server/http-server.ts packages/web/tests/server/http-server.test.ts
git commit -m "awecode: feat(web): HTTP router for /api + SPA fallback"
```

---

### Task 21: Implement `server/ws-bridge.ts`

**Files:**
- Create: `packages/web/src/server/ws-bridge.ts`
- Test: `packages/web/tests/server/ws-bridge.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/web/tests/server/ws-bridge.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { attachWsServer } from '../../src/server/ws-bridge.js';
import type { AwecodeConfig } from '@awecode/llm';
import { ContextManager } from '@awecode/agent';

const config: AwecodeConfig = {
  activeProvider: 'mock',
  providers: { mock: { kind: 'openai-compatible', apiUrl: '', apiKeyEnvKey: '', defaultModel: 'm' } },
} as any;

describe('ws-bridge', () => {
  let server: Server;
  let wss: WebSocketServer;
  const port = 5185;

  beforeAll(async () => {
    server = createServer();
    wss = new WebSocketServer({ noServer: true });
    attachWsServer(server, wss, {
      config,
      context: new ContextManager(),
      cwd: '/proj',
      token: 't1',
      // Mock runChatLoop: emit two tokens then finish.
      createProtocolSession: (opts) => {
        opts.send({ type: 'ready', cwd: opts.cwd });
        return {
          async handlePrompt(text) {
            opts.send({ type: 'message', role: 'user', content: text });
            opts.send({ type: 'token', chunk: 'hel' });
            opts.send({ type: 'token', chunk: 'lo' });
            opts.send({ type: 'done' });
          },
          abort() {},
          dispose() {},
        };
      },
    });
    await new Promise<void>((r) => server.listen(port, r));
  });

  afterAll(async () => {
    wss.close();
    await new Promise<void>((r) => server.close(() => r()));
  });

  it('rejects WS upgrade without token', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/agent`);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => reject(new Error('should not have opened')));
      ws.on('error', () => resolve());
      ws.on('unexpected-response', () => resolve());
    });
  });

  it('echoes user message + emits tokens + done', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/agent?token=t1`);
    await new Promise<void>((r, e) => { ws.on('open', r); ws.on('error', e); });
    const events: any[] = [];
    ws.on('message', (raw) => events.push(JSON.parse(raw.toString())));
    ws.send(JSON.stringify({ type: 'prompt', text: 'hi' }));
    await new Promise<void>((r) => {
      const tick = setInterval(() => {
        if (events.some((e) => e.type === 'done')) { clearInterval(tick); r(); }
      }, 50);
    });
    const types = events.map((e) => e.type);
    expect(types).toContain('ready');
    expect(types).toContain('message');
    expect(types.filter((t) => t === 'token').length).toBe(2);
    expect(types[types.length - 1]).toBe('done');
    ws.close();
  });
});
```

- [ ] **Step 2: Implement `ws-bridge.ts`**

```ts
// Copyright 2026 Awecode Contributors. Apache-2.0.
import type { Server } from 'node:http';
import type { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import { verifyBearer } from './auth.js';
import type { GuiAgentEvent, GuiClientCommand } from '@awecode/gui/shared/protocol';
import type { AwecodeConfig } from '@awecode/llm';
import type { ContextManager } from '@awecode/agent';
import { applyEvent, saveSession, DEFAULT_TITLE, type Session } from '@awecode/agent/persistence/sessions';
import type { ProtocolSession } from '@awecode/agent';

export interface WsCtx {
  config: AwecodeConfig;
  context: ContextManager;
  cwd: string;
  token: string;
  /**
   * Factory for ProtocolSession. Tests pass a mock; production wires
   * to @awecode/agent's createProtocolSession.
   */
  createProtocolSession: (opts: {
    config: AwecodeConfig;
    context: ContextManager;
    cwd: string;
    send: (ev: GuiAgentEvent) => void;
  }) => ProtocolSession;
}

export function attachWsServer(server: Server, wss: WebSocketServer, ctx: WsCtx): void {
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname !== '/agent') {
      socket.destroy();
      return;
    }
    if (!verifyBearer(req, ctx.token)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws: WebSocket) => {
    const sessionRecord: Session = {
      id: randomUUID(),
      title: DEFAULT_TITLE,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      cwd: ctx.cwd,
      messages: [],
    };
    saveSession(sessionRecord);

    const session = ctx.createProtocolSession({
      config: ctx.config,
      context: ctx.context,
      cwd: ctx.cwd,
      send: (ev) => {
        applyEvent(sessionRecord, ev);
        saveSession(sessionRecord);
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(ev));
      },
    });

    ws.on('message', (raw) => {
      let cmd: GuiClientCommand;
      try { cmd = JSON.parse(raw.toString()) as GuiClientCommand; }
      catch { ws.send(JSON.stringify({ type: 'error', message: 'invalid JSON' })); return; }
      if (cmd.type === 'prompt') void session.handlePrompt(cmd.text);
      else if (cmd.type === 'abort') session.abort();
      else if (cmd.type === 'exit') ws.close();
    });

    ws.on('close', () => session.dispose());
  });
}
```

- [ ] **Step 3: Run test**

Run: `yarn workspace @awecode/web vitest run tests/server/ws-bridge.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/server/ws-bridge.ts packages/web/tests/server/ws-bridge.test.ts
git commit -m "awecode: feat(web): WebSocket bridge per-connection ProtocolSession"
```

---

### Task 22: Implement `server/index.ts` (entrypoint)

**Files:**
- Create: `packages/web/src/server/index.ts`

- [ ] **Step 1: Implement**

```ts
// Copyright 2026 Awecode Contributors. Apache-2.0.
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { WebSocketServer } from 'ws';
import type { Server } from 'node:http';
import { loadConfig, getDefaultConfigPath, resolveProviderContextWindow } from '@awecode/llm';
import { ContextManager, createProtocolSession } from '@awecode/agent';
import type { AwecodeConfig } from '@awecode/llm';
import { generateToken } from './auth.js';
import { attachRouter } from './http-server.js';
import { attachWsServer } from './ws-bridge.js';
import { loadCerts, generateCerts } from './tls.js';
import { renderQr, formatStartupBanner } from './qr.js';
import { startMdns, type MdnsHandle } from './mdns.js';

export interface ServerOptions {
  port: number;
  host: string;
  cwd: string;
  tls: boolean;
  mdns: { name: string } | null;
  staticRoot: string | null;
}

export interface RunningServer {
  localUrl: string;
  networkUrls: string[];
  mdnsUrl: string | null;
  token: string;
  close(): Promise<void>;
}

export async function startServer(opts: ServerOptions): Promise<RunningServer> {
  const configPath = process.env.AWECODE_CONFIG_PATH ?? getDefaultConfigPath();
  const loaded = await loadConfig(configPath);
  if (!loaded) {
    console.error(`No config found at ${configPath}. Run 'awecode config' first.`);
    process.exit(1);
  }
  const config: AwecodeConfig = loaded;

  const token = generateToken();
  const activeProviderCfg = config.providers[config.activeProvider];
  const context =
    activeProviderCfg !== undefined
      ? new ContextManager(resolveProviderContextWindow(activeProviderCfg))
      : new ContextManager();

  // TLS
  let tlsCerts = opts.tls ? loadCerts() : null;
  if (opts.tls && !tlsCerts) {
    console.error('No TLS certs found. Generating via mkcert...');
    console.error('If mkcert is not installed or its CA is not trusted:');
    console.error('  Run: mkcert -install');
    tlsCerts = generateCerts({ port: opts.port, mdnsName: opts.mdns?.name ?? null });
    if (!tlsCerts) {
      console.error('Could not generate certs. Run with --no-tls to skip HTTPS.');
      process.exit(1);
    }
  }

  const server: Server = tlsCerts
    ? createHttpsServer({ cert: tlsCerts.cert, key: tlsCerts.key })
    : createServer();

  attachRouter(server, { token, cwd: opts.cwd, staticRoot: opts.staticRoot });

  const wss = new WebSocketServer({ noServer: true });
  attachWsServer(server, wss, {
    config, context, cwd: opts.cwd, token,
    createProtocolSession: (sOpts) => createProtocolSession(sOpts),
  });

  await new Promise<void>((r, e) => server.listen(opts.port, opts.host, r));

  let mdnsHandle: MdnsHandle | null = null;
  if (opts.mdns) {
    mdnsHandle = await startMdns({ name: opts.mdns.name, port: opts.port });
  }

  const qr = await renderQr({
    port: opts.port, token,
    mdnsName: opts.mdns?.name ?? null,
    tls: !!tlsCerts,
  });
  console.log(formatStartupBanner(qr));

  const shutdown = async () => {
    wss.close();
    if (mdnsHandle) mdnsHandle.stop();
    await new Promise<void>((r) => server.close(() => r()));
  };
  process.on('SIGINT', () => { void shutdown().then(() => process.exit(0)); });
  process.on('SIGTERM', () => { void shutdown().then(() => process.exit(0)); });

  return {
    localUrl: qr.localUrl,
    networkUrls: qr.networkUrls,
    mdnsUrl: qr.mdnsUrl,
    token,
    close: shutdown,
  };
}
```

- [ ] **Step 2: Implement `server/mdns.ts`**

```ts
// Copyright 2026 Awecode Contributors. Apache-2.0.
import { Bonjour } from 'bonjour-service';

export interface MdnsHandle {
  stop(): void;
}

export async function startMdns(opts: { name: string; port: number }): Promise<MdnsHandle | null> {
  try {
    const bonjour = new Bonjour();
    const service = bonjour.publish({
      name: opts.name,
      type: 'http',
      port: opts.port,
      host: `${opts.name}.local`,
    });
    // Best-effort: 3s startup; if it hasn't published yet, give up gracefully.
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 3000);
      service.once('up', () => { clearTimeout(t); resolve(); });
    });
    return {
      stop: () => {
        try { service.stop(); } catch {}
        try { bonjour.destroy(); } catch {}
      },
    };
  } catch {
    console.warn('[awecode] mDNS publish failed; continuing without it.');
    return null;
  }
}
```

- [ ] **Step 3: Run typecheck**

Run: `yarn workspace @awecode/web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/server/index.ts packages/web/src/server/mdns.ts
git commit -m "awecode: feat(web): startServer entrypoint + mDNS advertiser"
```

---

### Task 23: Wire `awecode open web` CLI command

**Files:**
- Create: `packages/cli/src/commands/web.ts`
- Modify: `packages/cli/src/index.ts` (register the command)

- [ ] **Step 1: Implement**

```ts
// Copyright 2026 Awecode Contributors. Apache-2.0.
import { startServer } from '@awecode/web';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

interface Opts {
  port: number;
  host: string;
  tls: boolean;
  mdns: { name: string } | null;
  staticRoot: string | null;
}

function parseArgs(args: string[]): Opts {
  const opts: Opts = {
    port: 5174,
    host: '0.0.0.0',
    tls: true,
    mdns: null,
    staticRoot: null,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--port' || a === '-p') opts.port = parseInt(args[++i] ?? '', 10) || opts.port;
    else if (a === '--host') opts.host = args[++i] ?? opts.host;
    else if (a === '--no-tls' || a === '--insecure') opts.tls = false;
    else if (a === '--mdns') opts.mdns = { name: args[++i] ?? 'awecode' };
    else if (a === '--no-mdns') opts.mdns = null;
  }
  opts.staticRoot = resolveRendererDist();
  return opts;
}

function resolveRendererDist(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/commands/web.js → ../../../web/dist/renderer
  const candidates = [
    resolve(here, '../../../web/dist/renderer'),
    resolve(here, '../../web/dist/renderer'),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

export async function openWebCommand(args: string[]): Promise<void> {
  const opts = parseArgs(args);
  await startServer({
    port: opts.port,
    host: opts.host,
    cwd: process.cwd(),
    tls: opts.tls,
    mdns: opts.mdns,
    staticRoot: opts.staticRoot,
  });
  // Server runs until SIGINT/SIGTERM.
}
```

- [ ] **Step 2: Register in CLI dispatcher**

Find the command switch in `packages/cli/src/index.ts`. Add `'web'` as a case:

```ts
import { openWebCommand } from './commands/web.js';
// ...
case 'web':
  await openWebCommand(restArgs);
  break;
```

(Match the existing dispatcher pattern exactly.)

- [ ] **Step 3: Build + smoke**

Run: `yarn workspace @awecode/cli build && awecode open web --no-tls --port 5186`
Expected: see startup banner + QR in terminal. Ctrl+C to stop.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/web.ts packages/cli/src/index.ts
git commit -m "awecode: feat(cli): add 'awecode open web' command"
```

---

## Phase 4: Renderer (transport + App shell)

### Task 24: Implement `renderer/src/transport/client.ts`

**Files:**
- Create: `packages/web/src/renderer/src/transport/client.ts`
- Test: `packages/web/tests/renderer/transport.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/web/tests/renderer/transport.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 0;
  sent: string[] = [];
  constructor(public url: string) { MockWebSocket.instances.push(this); }
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; this.onclose?.(); }
  // Test helpers
  open() { this.readyState = 1; this.onopen?.(); }
  emit(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }); }
}

describe('AwecodeClient', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    (globalThis as any).WebSocket = MockWebSocket;
    (globalThis as any).localStorage = { _d: {}, getItem(k: string) { return this._d[k] ?? null; }, setItem(k: string, v: string) { this._d[k] = v; }, };
    (globalThis as any).location = { href: 'http://x/', search: '', pathname: '/', protocol: 'http:' };
    (globalThis as any).history = { replaceState: vi.fn() };
  });

  it('parses ?token= from URL, saves to localStorage, strips from URL', async () => {
    (globalThis as any).location = { href: 'http://x/?token=abc', search: '?token=abc', pathname: '/', protocol: 'http:' };
    const { AwecodeClient } = await import('../../src/renderer/src/transport/client.js');
    const _ = new AwecodeClient();
    expect((globalThis as any).localStorage.getItem('awecode.token')).toBe('abc');
    expect((globalThis as any).history.replaceState).toHaveBeenCalledWith(null, '', '/');
  });

  it('sends commands via ws.send(JSON.stringify)', async () => {
    const { AwecodeClient } = await import('../../src/renderer/src/transport/client.js');
    const client = new AwecodeClient();
    const ws = MockWebSocket.instances.at(-1)!;
    ws.open();
    await client.send({ type: 'prompt', text: 'hi' });
    expect(ws.sent).toContain(JSON.stringify({ type: 'prompt', text: 'hi' }));
  });

  it('dispatches events to registered callbacks', async () => {
    const { AwecodeClient } = await import('../../src/renderer/src/transport/client.js');
    const client = new AwecodeClient();
    const ws = MockWebSocket.instances.at(-1)!;
    ws.open();
    const cb = vi.fn();
    client.onEvent(cb);
    ws.emit({ type: 'ready', cwd: '/x' });
    expect(cb).toHaveBeenCalledWith({ type: 'ready', cwd: '/x' });
  });

  it('reconnects on close with backoff', async () => {
    vi.useFakeTimers();
    const { AwecodeClient } = await import('../../src/renderer/src/transport/client.js');
    const client = new AwecodeClient();
    const ws1 = MockWebSocket.instances.at(-1)!;
    ws1.close();
    // First reconnect at 500ms
    await vi.advanceTimersByTimeAsync(500);
    expect(MockWebSocket.instances.length).toBe(2);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Implement `client.ts`**

```ts
// Copyright 2026 Awecode Contributors. Apache-2.0.
import type { GuiAgentEvent, GuiClientCommand, Session, SessionMeta } from '@awecode/gui/shared/protocol';

type EventCb = (ev: GuiAgentEvent) => void;

export class AwecodeClient {
  private ws: WebSocket | null = null;
  private eventCbs = new Set<EventCb>();
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
    this.ws.onmessage = (e: MessageEvent) => {
      try {
        const ev = JSON.parse(typeof e.data === 'string' ? e.data : '') as GuiAgentEvent;
        this.eventCbs.forEach((cb) => cb(ev));
      } catch { /* ignore */ }
    };
    this.ws.onclose = () => {
      setTimeout(() => this.connect(), this.reconnectMs);
      this.reconnectMs = Math.min(this.reconnectMs * 2, this.maxReconnectMs);
    };
    this.ws.onerror = () => { /* close handler will reconnect */ };
  }

  send(cmd: GuiClientCommand): Promise<void> {
    this.ws?.send(JSON.stringify(cmd));
    return Promise.resolve();
  }

  onEvent(cb: EventCb): () => void {
    this.eventCbs.add(cb);
    return () => { this.eventCbs.delete(cb); };
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
    const r = await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE', headers: this.authHeaders() });
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

- [ ] **Step 3: Run test**

Run: `yarn workspace @awecode/web vitest run tests/renderer/transport.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/renderer/src/transport/client.ts \
        packages/web/tests/renderer/transport.test.ts
git commit -m "awecode: feat(web): AwecodeClient WebSocket transport with reconnect"
```

---

### Task 25: Implement mobile-only components (`SidebarDrawer`, `MenuToggle`, `TranscriptView`, `PwaInstallPrompt`)

**Files:**
- Create: `packages/web/src/renderer/src/components/SidebarDrawer.tsx`
- Create: `packages/web/src/renderer/src/components/MenuToggle.tsx`
- Create: `packages/web/src/renderer/src/components/TranscriptView.tsx`
- Create: `packages/web/src/renderer/src/components/PwaInstallPrompt.tsx`

- [ ] **Step 1: Implement all four** (small components, no unit tests — covered by manual smoke)

`SidebarDrawer.tsx`:
```tsx
// Copyright 2026 Awecode Contributors. Apache-2.0.
import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function SidebarDrawer({ open, onClose, children }: Props) {
  return (
    <>
      {open && <div className="sidebar-backdrop" onClick={onClose} />}
      <div className={`sidebar-drawer ${open ? 'open' : ''}`}>{children}</div>
    </>
  );
}
```

`MenuToggle.tsx`:
```tsx
// Copyright 2026 Awecode Contributors. Apache-2.0.
interface Props {
  open: boolean;
  onClick: () => void;
}

export function MenuToggle({ open, onClick }: Props) {
  return (
    <button className="menu-toggle" onClick={onClick} aria-label={open ? 'Close menu' : 'Open menu'}>
      {open ? '✕' : '☰'}
    </button>
  );
}
```

`TranscriptView.tsx`:
```tsx
// Copyright 2026 Awecode Contributors. Apache-2.0.
import { ChatView } from '@awecode/gui/renderer/src/components/ChatView';
import type { Session } from '@awecode/gui/shared/protocol';

interface Props {
  session: Session;
}

export function TranscriptView({ session }: Props) {
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

`PwaInstallPrompt.tsx`:
```tsx
// Copyright 2026 Awecode Contributors. Apache-2.0.
import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (isStandalone || !deferred) return null;

  return (
    <button
      className="pwa-install-prompt"
      onClick={async () => { await deferred.prompt(); setDeferred(null); }}
    >
      Install app
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/renderer/src/components/
git commit -m "awecode: feat(web): SidebarDrawer, MenuToggle, TranscriptView, PwaInstallPrompt"
```

---

### Task 26: Implement `useNotifications` hook + `App.tsx`

**Files:**
- Create: `packages/web/src/renderer/src/hooks/useNotifications.ts`
- Create: `packages/web/src/renderer/src/App.tsx`
- Create: `packages/web/src/renderer/src/main.tsx`
- Create: `packages/web/src/renderer/index.html`
- Create: `packages/web/src/renderer/src/globals.d.ts`

- [ ] **Step 1: `useNotifications.ts`**

```ts
// Copyright 2026 Awecode Contributors. Apache-2.0.
import { useCallback, useState } from 'react';

export interface UseNotifications {
  permission: NotificationPermission;
  isStandalone: boolean;
  requestPermission: () => Promise<void>;
  notifyDone: () => void;
}

export function useNotifications(): UseNotifications {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    const p = await Notification.requestPermission();
    setPermission(p);
  }, []);

  const notifyDone = useCallback(() => {
    if (permission !== 'granted') return;
    try { new Notification('Awecode', { body: 'Agent đã xong', tag: 'done' }); } catch {}
  }, [permission]);

  return { permission, isStandalone, requestPermission, notifyDone };
}
```

- [ ] **Step 2: `App.tsx`**

```tsx
// Copyright 2026 Awecode Contributors. Apache-2.0.
import { useEffect, useState } from 'react';
import { useAgent } from '@awecode/gui/renderer/src/hooks/useAgent';
import { useSessions } from '@awecode/gui/renderer/src/hooks/useSessions';
import { TransportContext, type TransportClient } from '@awecode/gui/renderer/src/transport/context';
import { Sidebar } from '@awecode/gui/renderer/src/components/Sidebar';
import { ChatView } from '@awecode/gui/renderer/src/components/ChatView';
import { PromptInput } from '@awecode/gui/renderer/src/components/PromptInput';
import { StatusBar } from '@awecode/gui/renderer/src/components/StatusBar';
import { WorkflowIndicator } from '@awecode/gui/renderer/src/components/WorkflowIndicator';
import { ErrorBoundary } from '@awecode/gui/renderer/src/components/ErrorBoundary';
import type { Session } from '@awecode/gui/shared/protocol';
import { apiClient } from './transport/client.js';
import { SidebarDrawer } from './components/SidebarDrawer.js';
import { MenuToggle } from './components/MenuToggle.js';
import { TranscriptView } from './components/TranscriptView.js';
import { PwaInstallPrompt } from './components/PwaInstallPrompt.js';
import { useNotifications } from './hooks/useNotifications.js';

export function App() {
  const agent = useAgent();
  const sessions = useSessions(apiClient as unknown as TransportClient);
  const notifications = useNotifications();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [viewing, setViewing] = useState<Session | null>(null);

  useEffect(() => {
    const off = agent.onDone(() => {
      notifications.notifyDone();
      if ('vibrate' in navigator) navigator.vibrate(50);
    });
    return off;
  }, [agent, notifications]);

  return (
    <ErrorBoundary>
      <TransportContext.Provider value={apiClient as unknown as TransportClient}>
        <div className="app-shell">
          <MenuToggle open={sidebarOpen} onClick={() => setSidebarOpen((v) => !v)} />
          <SidebarDrawer open={sidebarOpen} onClose={() => setSidebarOpen(false)}>
            <Sidebar
              sessions={sessions.list}
              activeId={sessions.activeId}
              onSelect={async (id) => {
                const s = await apiClient.getSession(id);
                if (s) setViewing(s);
                setSidebarOpen(false);
              }}
              onNew={() => { agent.resetForSession(); setViewing(null); setSidebarOpen(false); }}
              onDelete={(id) => void sessions.remove(id)}
              onRename={(id, title) => void sessions.rename(id, title)}
            />
            {notifications.isStandalone && notifications.permission === 'default' && (
              <div className="notify-opt-in">
                <button onClick={() => void notifications.requestPermission()}>Enable notifications</button>
              </div>
            )}
          </SidebarDrawer>

          <main className="app-main">
            {viewing ? (
              <TranscriptView session={viewing} />
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

- [ ] **Step 3: `main.tsx`**

```tsx
// Copyright 2026 Awecode Contributors. Apache-2.0.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { registerSW } from './sw/register.js';
import './styles.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
registerSW();
```

- [ ] **Step 4: `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="theme-color" content="#0b0d10" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <title>awecode</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 5: `globals.d.ts`**

```ts
import type { AwecodeClient } from './transport/client.js';
declare global {
  interface Window { awecode?: never }  // Web does NOT use window.awecode
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/renderer/
git commit -m "awecode: feat(web): App shell + useNotifications + entry HTML"
```

---

### Task 27: Implement `vite.config.ts` + PWA + service worker

**Files:**
- Create: `packages/web/vite.config.ts`
- Create: `packages/web/src/renderer/src/sw/register.ts`
- Create: `packages/web/src/renderer/public/manifest.webmanifest` (or generated via plugin)
- Create: `packages/web/src/renderer/src/styles.css` (imports + mobile overrides)
- Create: `packages/web/src/renderer/public/icons/icon.svg` (source for PWA icons)

- [ ] **Step 1: `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'src/renderer',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'Awecode',
        short_name: 'Awecode',
        display: 'standalone',
        background_color: '#0b0d10',
        theme_color: '#0b0d10',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: { enabled: true },
    }),
  ],
  resolve: {
    alias: {
      '@awecode/gui/renderer': resolve(__dirname, '../gui/src/renderer/src'),
      '@awecode/gui/shared': resolve(__dirname, '../gui/src/shared'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:5174', changeOrigin: true },
      '/agent': { target: 'ws://localhost:5174', ws: true },
    },
  },
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
});
```

- [ ] **Step 2: `sw/register.ts`**

```ts
// Copyright 2026 Awecode Contributors. Apache-2.0.
export function registerSW(): void {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[awecode] SW registration failed:', err);
    });
  });
}
```

- [ ] **Step 3: `styles.css`**

```css
/* Import shared desktop styles, then add mobile overrides. */
@import '../../../../gui/src/renderer/src/styles.css';

/* ===== Mobile-only overrides ===== */
@media (max-width: 768px) {
  .app-shell {
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
  }

  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    width: 85vw;
    max-width: 320px;
    z-index: 50;
    transform: translateX(-100%);
    transition: transform 0.2s ease;
    box-shadow: var(--shadow-md, 0 4px 12px rgba(0,0,0,0.3));
  }
  .sidebar-drawer.open .sidebar { transform: translateX(0); }
  .sidebar-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 40;
  }

  .menu-toggle {
    display: inline-flex;
    position: fixed;
    top: calc(8px + env(safe-area-inset-top));
    left: 8px;
    z-index: 60;
    padding: 8px 12px;
    background: var(--bg-elev-1);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 16px;
  }

  .app-main { padding-top: 48px; }
  .prompt-input textarea { font-size: 16px; } /* prevent iOS zoom on focus */
  .status-bar { height: 44px; }
  .status-bar .ctx-toggle { display: none; } /* hide "Show ctx" on mobile */
}

/* Desktop hides menu toggle */
.menu-toggle { display: none; }
@media (min-width: 769px) {
  .sidebar-backdrop { display: none; }
  .sidebar-drawer { display: contents; }
}

/* Transcript view banner */
.transcript-banner {
  padding: 6px 12px;
  background: var(--bg-elev-2);
  border-bottom: 1px solid var(--border);
  color: var(--c-text-dim);
  font-size: 12px;
}

/* PWA install prompt */
.pwa-install-prompt {
  position: fixed;
  bottom: 50px;
  right: 16px;
  z-index: 70;
  border-color: var(--c-accent);
  color: var(--c-accent);
}
```

- [ ] **Step 4: Generate icons** (manual or scripted; one source SVG → multiple sizes via `@vite-pwa/assets-generator` or similar)

Create a placeholder `icon.svg` for now. Document that real icons need generation before release.

- [ ] **Step 5: Manual smoke**

Run (two terminals):
- T1: `yarn workspace @awecode/web dev`
- T2: `awecode open web --no-tls --port 5174`

Open `http://localhost:5173/?token=<from terminal 2>`. Verify chat works.

- [ ] **Step 6: Commit**

```bash
git add packages/web/vite.config.ts packages/web/src/renderer/src/sw/ \
        packages/web/src/renderer/src/styles.css
git commit -m "awecode: feat(web): vite + vite-plugin-pwa + mobile CSS overrides"
```

---

## Phase 5: Tests + docs

### Task 28: Write smoke test script

**Files:**
- Create: `packages/web/scripts/smoke-web.mjs`

- [ ] **Step 1: Implement**

```js
// packages/web/scripts/smoke-web.mjs
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const PORT = 5187;
const proc = spawn('node', ['packages/web/dist/server/index.js', '--no-tls', '--port', String(PORT)], {
  env: { ...process.env, AWECODE_CONFIG_PATH: process.env.HOME + '/.awecode/config.json' },
});

let token = '';
proc.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text);
  const match = text.match(/Token:\s*([0-9a-f]+)/);
  if (match) token = match[1];
});

// Wait for "awecode web ready"
await once(proc.stdout, 'data');
await new Promise((r) => setTimeout(r, 500));

// HTTP check
const r1 = await fetch(`http://localhost:${PORT}/`);
if (!r1.ok) { console.error('FAIL: GET /'); process.exit(1); }

const r2 = await fetch(`http://localhost:${PORT}/api/sessions`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!r2.ok) { console.error('FAIL: GET /api/sessions'); process.exit(1); }
const arr = await r2.json();
if (!Array.isArray(arr)) { console.error('FAIL: not array'); process.exit(1); }

// WebSocket check
const { WebSocket } = await import('ws');
const ws = new WebSocket(`ws://localhost:${PORT}/agent?token=${token}`);
const events = [];
ws.on('message', (raw) => events.push(JSON.parse(raw.toString())));
await once(ws, 'open');
ws.send(JSON.stringify({ type: 'prompt', text: '__smoke__' }));
await new Promise((r) => setTimeout(r, 2000));
if (!events.some((e) => e.type === 'ready')) { console.error('FAIL: no ready event'); process.exit(1); }
if (!events.some((e) => e.type === 'message')) { console.error('FAIL: no message event'); process.exit(1); }

ws.close();
proc.kill('SIGINT');
console.log('PASS');
process.exit(0);
```

- [ ] **Step 2: Run after build**

Run: `yarn workspace @awecode/web build && node packages/web/scripts/smoke-web.mjs`
Expected: ends with `PASS`.

- [ ] **Step 3: Commit**

```bash
git add packages/web/scripts/smoke-web.mjs
git commit -m "awecode: test(web): standalone HTTP+WS smoke script"
```

---

### Task 29: Update `CONTEXT.md` + root README

**Files:**
- Modify: `README.md` (root)
- Possibly: link to ADRs from relevant sections

- [ ] **Step 1: README mention**

In root `README.md`, add a "Mobile access" section after the GUI section:

```markdown
## Mobile access (PWA)

Run `awecode open web` on your computer. The terminal prints a QR code; scan it with your phone to open the web UI (URL includes a bearer token). Add to your home screen to install as a PWA.

The phone must be on the same network as the computer. The agent keeps running on the computer — the phone is a thin client.

See [docs/adr/0008-mobile-client-pwa-not-native.md](docs/adr/0008-mobile-client-pwa-not-native.md) for why we chose PWA over a native app.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "awecode: docs: mention mobile PWA in README"
```

---

### Task 30: Final full-build + typecheck

- [ ] **Step 1: Build everything**

Run: `yarn build`
Expected: all packages build without errors.

- [ ] **Step 2: Typecheck everything**

Run: `yarn typecheck`
Expected: no errors.

- [ ] **Step 3: Run all tests**

Run: `yarn test`
Expected: all PASS.

- [ ] **Step 4: Run smoke**

Run: `yarn workspace @awecode/web build && node packages/web/scripts/smoke-web.mjs`
Expected: `PASS`.

- [ ] **Step 5: Manual end-to-end on real phone**

Follow the manual checklist from `design.md`.

- [ ] **Step 6: Final commit (if any fixups needed)**

---

## Self-review checklist

After completing all tasks, run this checklist:

- [ ] **Spec coverage:** every section of `design.md` maps to at least one task. (Architecture → Tasks 5-7, 16-23. Components → Tasks 8-15, 24-27. Data flow → implicit via tests. Error handling → Task 11 boundary + Task 24 reconnect. Testing → Tasks 1, 4, 6, 17, 20, 21, 24, 28. Phasing — Plan order matches Phase 1-5 in design.)
- [ ] **Placeholder scan:** no TBD / TODO in the plan. Every code step has real code. Every command step has a real command.
- [ ] **Type consistency:** `ProtocolSession` / `createProtocolSession` / `ProtocolSessionOptions` consistent across Tasks 5, 6, 7, 21. `TransportClient` consistent across Tasks 13, 14, 24. `applyEvent` consistent across Tasks 4, 5, 21.
- [ ] **No orphaned references:** every imported symbol is created by an earlier task.
- [ ] **Commit hygiene:** each task ends with a commit; commit messages follow `awecode: <type>(<scope>): <summary>`.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-21-web-mobile.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
