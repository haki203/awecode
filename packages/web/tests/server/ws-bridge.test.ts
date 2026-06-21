// Copyright 2026 Awecode Contributors. Apache-2.0.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { attachWsServer } from '../../src/server/ws-bridge.js';
import type { AwecodeConfig } from '@awecode/llm';
import { ContextManager } from '@awecode/agent';
import type { GuiAgentEvent } from '@awecode/gui/shared/protocol';

const mockConfig: AwecodeConfig = {
  activeProvider: 'mock',
  providers: {
    mock: {
      type: 'ollama' as const,
      baseURL: 'http://localhost',
      defaultModel: 'mock-model',
    },
  },
} as AwecodeConfig;

// Minimal ProtocolSession stub that satisfies the WsCtx.createProtocolSession factory.
function makeMockSessionFactory() {
  return (_opts: {
    config: AwecodeConfig;
    context: ContextManager;
    cwd: string;
    send: (ev: GuiAgentEvent) => void;
  }) => {
    return {
      // Mock session: on handlePrompt, emit ready + user echo + 2 tokens + done.
      async handlePrompt(text: string) {
        _opts.send({ type: 'ready', cwd: _opts.cwd });
        _opts.send({ type: 'message', role: 'user' as const, content: text });
        _opts.send({ type: 'token', chunk: 'hel' });
        _opts.send({ type: 'token', chunk: 'lo' });
        _opts.send({ type: 'done' });
      },
      abort() {},
      dispose() {},
    };
  };
}

describe('ws-bridge', () => {
  let server: Server;
  let wss: WebSocketServer;
  const port = 5187 + Math.floor(Math.random() * 100);

  beforeAll(async () => {
    server = createServer();
    wss = new WebSocketServer({ noServer: true });
    // Use a temp sessions dir to avoid polluting ~/.awecode/sessions
    const mkdtempSync = (await import('node:fs')).mkdtempSync;
    const tmpdir = (await import('node:os')).tmpdir;
    const join = (await import('node:path')).join;
    process.env.AWECODE_SESSIONS_DIR = mkdtempSync(join(tmpdir(), 'awecode-ws-test-'));
    attachWsServer(server, wss, {
      config: mockConfig,
      context: new ContextManager(),
      cwd: '/proj',
      token: 't1',
      createProtocolSession: makeMockSessionFactory() as any,
    });
    await new Promise<void>((r) => server.listen(port, r));
  });

  afterAll(async () => {
    wss.close();
    await new Promise<void>((r) => server.close(() => r()));
    delete process.env.AWECODE_SESSIONS_DIR;
  });

  it('rejects WS upgrade without token', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/agent`);
    await new Promise<void>((resolve) => {
      ws.on('open', () => { throw new Error('should not have opened'); });
      ws.on('error', () => resolve());
      ws.on('unexpected-response', () => resolve());
    });
    ws.close();
  });

  it('rejects WS upgrade with wrong token', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/agent?token=wrong`);
    await new Promise<void>((resolve) => {
      ws.on('open', () => { throw new Error('should not have opened'); });
      ws.on('error', () => resolve());
      ws.on('unexpected-response', () => resolve());
    });
    ws.close();
  });

  it('accepts upgrade with token, echoes user message + tokens + done', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/agent?token=t1`);
    await new Promise<void>((r, e) => { ws.on('open', r); ws.on('error', e); });
    const events: GuiAgentEvent[] = [];
    ws.on('message', (raw) => {
      try { events.push(JSON.parse(raw.toString()) as GuiAgentEvent); } catch {}
    });
    ws.send(JSON.stringify({ type: 'prompt', text: 'hi' }));
    // Wait for done event with timeout
    await new Promise<void>((resolve) => {
      const tick = setInterval(() => {
        if (events.some((e) => e.type === 'done')) {
          clearInterval(tick);
          resolve();
        }
      }, 50);
      setTimeout(() => { clearInterval(tick); resolve(); }, 3000);
    });
    const types = events.map((e) => e.type);
    expect(types).toContain('ready');
    expect(types).toContain('message');
    expect(types.filter((t) => t === 'token').length).toBe(2);
    expect(types[types.length - 1]).toBe('done');
    ws.close();
  });
});
