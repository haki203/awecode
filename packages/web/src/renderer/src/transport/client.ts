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
