// Copyright 2026 Awecode Contributors. Apache-2.0.
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
