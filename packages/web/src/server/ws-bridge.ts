// Copyright 2026 Awecode Contributors. Apache-2.0.
import type { Server } from 'node:http';
import type { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import { verifyBearer } from './auth.js';
import type { GuiAgentEvent, GuiClientCommand } from '@awecode/gui/shared/protocol';
import type { AwecodeConfig } from '@awecode/llm';
import type { ModelMessage } from 'ai';
import type { ContextManager, ProtocolSession } from '@awecode/agent';
import { applyEvent, resumeFromMessages } from '@awecode/agent';
import {
  saveSession,
  loadSession,
  DEFAULT_TITLE,
  type Session,
} from '@awecode/agent/persistence/sessions';

/**
 * Factory signature matches @awecode/agent's createProtocolSession, but
 * injected via opts so tests can mock without touching module resolution.
 */
export type ProtocolSessionFactory = (opts: {
  config: AwecodeConfig;
  context: ContextManager;
  cwd: string;
  send: (ev: GuiAgentEvent) => void;
  initialMessages?: ModelMessage[];
}) => ProtocolSession;

export interface WsCtx {
  config: AwecodeConfig;
  context: ContextManager;
  cwd: string;
  token: string;
  /** Factory for ProtocolSession. Production wires to createProtocolSession from @awecode/agent. */
  createProtocolSession: ProtocolSessionFactory;
}

/**
 * Attach a WebSocketServer to an HTTP server for the /agent path.
 * Each connection = one ProtocolSession + one Session record.
 *
 * Lifecycle:
 *   - On connection: create a new Session record, instantiate ProtocolSession,
 *     wire every emitted event to (1) applyEvent (persist) + (2) ws.send (broadcast).
 *   - On message: dispatch to session.handlePrompt / session.abort / ws.close.
 *   - On close: session.dispose (which aborts in-flight runChatLoop).
 *
 * Auth: verifyBearer on the upgrade request. Browsers can't set headers on
 * WebSocket — they pass ?token=<token> in the URL query string.
 */
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

  wss.on('connection', (ws: WebSocket, req) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const requestedSessionId = url.searchParams.get('sessionId');

    let sessionRecord: Session;
    let initialMessages: ModelMessage[] | undefined;

    if (requestedSessionId) {
      const existing = loadSession(requestedSessionId);
      if (existing) {
        sessionRecord = existing;
        initialMessages = resumeFromMessages(existing.messages);
      } else {
        // Session not found — fall back to creating a new one.
        sessionRecord = {
          id: randomUUID(),
          title: DEFAULT_TITLE,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          cwd: ctx.cwd,
          messages: [],
        };
        saveSession(sessionRecord);
      }
    } else {
      // New session per connection (legacy behavior).
      sessionRecord = {
        id: randomUUID(),
        title: DEFAULT_TITLE,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        cwd: ctx.cwd,
        messages: [],
      };
      saveSession(sessionRecord);
    }

    // Each connection gets its own ProtocolSession bound to this WS.
    const session = ctx.createProtocolSession({
      config: ctx.config,
      context: ctx.context,
      cwd: ctx.cwd,
      send: (ev) => {
        // Persist every event into the Session record.
        applyEvent(sessionRecord, ev);
        saveSession(sessionRecord);
        // Broadcast to the client.
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify(ev));
        }
      },
      ...(initialMessages ? { initialMessages } : {}),
    });

    ws.on('message', (raw) => {
      let cmd: GuiClientCommand;
      try {
        cmd = JSON.parse(raw.toString()) as GuiClientCommand;
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'invalid JSON' } as GuiAgentEvent));
        return;
      }
      if (cmd.type === 'prompt') {
        void session.handlePrompt(cmd.text);
      } else if (cmd.type === 'abort') {
        session.abort();
      } else if (cmd.type === 'exit') {
        ws.close();
      }
    });

    ws.on('close', () => {
      session.dispose();
    });
  });
}
