// Copyright 2026 Awecode Contributors. Apache-2.0.
import type { GuiAgentEvent, GuiClientCommand, Session, SessionMeta } from '@awecode/gui/shared/protocol';

type EventCb = (ev: GuiAgentEvent) => void;
type StatusCb = (status: TransportStatus) => void;

export type TransportStatus = 'connecting' | 'open' | 'closed';

/**
 * WebSocket transport for the web PWA.
 *
 * Auto-reconnects with exponential backoff (500ms → 5s). Exposes a
 * `onStatus` channel so React can surface "reconnecting…" state and,
 * critically, so `useAgent` can unstick `isStreaming` when the socket
 * dies mid-stream (otherwise the UI hangs on "agent is working" forever
 * because the server's `done` event never arrives over a dead socket).
 */
export class AwecodeClient {
  private ws: WebSocket | null = null;
  private eventCbs = new Set<EventCb>();
  private statusCbs = new Set<StatusCb>();
  private status: TransportStatus = 'connecting';
  private reconnectMs = 500;
  private readonly maxReconnectMs = 5000;
  private token: string;
  private sessionId: string | null = null;

  constructor() {
    const params = new URLSearchParams(location.search);
    this.token = params.get('token') ?? localStorage.getItem('awecode.token') ?? '';
    if (params.get('token')) {
      localStorage.setItem('awecode.token', this.token);
      history.replaceState(null, '', location.pathname);
    }
    this.connect();
  }

  /**
   * Reconnect to the server, resuming the specified session. Pass null to
   * start a fresh session.
   */
  resume(sessionId: string | null): void {
    this.sessionId = sessionId;
    this.reconnectMs = 500;
    this.disconnect();
    this.connect();
  }

  private disconnect(): void {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  private setStatus(s: TransportStatus): void {
    this.status = s;
    this.statusCbs.forEach((cb) => cb(s));
  }

  getStatus(): TransportStatus {
    return this.status;
  }

  onStatus(cb: StatusCb): () => void {
    this.statusCbs.add(cb);
    // Fire immediately so subscribers don't need a separate bootstrap call.
    cb(this.status);
    return () => { this.statusCbs.delete(cb); };
  }

  private connect(): void {
    this.setStatus('connecting');
    const url = new URL('/agent', location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('token', this.token);
    if (this.sessionId) {
      url.searchParams.set('sessionId', this.sessionId);
    }
    this.ws = new WebSocket(url.toString());
    this.ws.onopen = () => {
      this.reconnectMs = 500;
      this.setStatus('open');
    };
    this.ws.onmessage = (e: MessageEvent) => {
      try {
        const ev = JSON.parse(typeof e.data === 'string' ? e.data : '') as GuiAgentEvent;
        this.eventCbs.forEach((cb) => cb(ev));
      } catch { /* ignore malformed frame; server logs it */ }
    };
    this.ws.onclose = () => {
      this.setStatus('closed');
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
