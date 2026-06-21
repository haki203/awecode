// Copyright 2026 Awecode Contributors. Apache-2.0.
import { describe, it, expect } from 'vitest';
import type { ModelMessage } from 'ai';
import type { AwecodeConfig } from '@awecode/llm';
import type { GuiAgentEvent } from '@awecode/gui/shared/protocol';
import { createProtocolSession } from '../src/protocol-session.js';
import { ContextManager } from '../src/context/manager.js';

// Mock runChatLoop — captures callbacks so we can drive them manually.
// The signature must match the real runChatLoop: (messages, opts) => Promise<ModelMessage[]>
function mockRunChatLoop(messages: ModelMessage[], opts: any): Promise<ModelMessage[]> {
  // Emit a user echo, two tokens, then finish.
  opts.onToken?.('hel');
  opts.onToken?.('lo');
  messages.push({ role: 'assistant', content: 'hello' });
  opts.onDone?.();
  return Promise.resolve(messages);
}

const mockConfig: AwecodeConfig = {
  activeProvider: 'mock',
  providers: {
    mock: {
      type: 'ollama' as const,
      baseURL: 'http://localhost',
      defaultModel: 'mock-model',
    },
  },
};

describe('ProtocolSession', () => {
  it('emits ready on creation, echoes user message + tokens + done on handlePrompt', async () => {
    const events: GuiAgentEvent[] = [];
    const session = createProtocolSession({
      config: mockConfig,
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

  it('abort() signals runChatLoop via abortSignal', async () => {
    let abortCalled = false;
    function abortableRunLoop(_msgs: ModelMessage[], opts: any): Promise<ModelMessage[]> {
      return new Promise((resolve) => {
        opts.abortSignal.addEventListener('abort', () => {
          abortCalled = true;
          resolve([]);
        });
      });
    }

    const session = createProtocolSession({
      config: mockConfig,
      context: new ContextManager(),
      cwd: '/proj',
      send: () => {},
      runChatLoop: abortableRunLoop as any,
    });

    const p = session.handlePrompt('long-running');
    // Give the loop a tick to register the abort listener.
    await new Promise((r) => setTimeout(r, 10));
    session.abort();
    await p;
    expect(abortCalled).toBe(true);
  });

  it('maps runChatLoop throw to error event + done', async () => {
    const events: GuiAgentEvent[] = [];
    function throwingRunLoop(): Promise<ModelMessage[]> {
      return Promise.reject(new Error('boom'));
    }

    const session = createProtocolSession({
      config: mockConfig,
      context: new ContextManager(),
      cwd: '/proj',
      send: (ev) => { events.push(ev); },
      runChatLoop: throwingRunLoop as any,
    });

    await session.handlePrompt('x');

    expect(events.some((e) => e.type === 'error' && e.message.includes('boom'))).toBe(true);
    expect(events[events.length - 1]!.type).toBe('done');
  });

  it('handles abort gracefully (AbortError → [aborted] message)', async () => {
    const events: GuiAgentEvent[] = [];
    function abortingRunLoop(_msgs: ModelMessage[], _opts: any): Promise<ModelMessage[]> {
      const err: any = new Error('aborted');
      err.name = 'AbortError';
      return Promise.reject(err);
    }

    const session = createProtocolSession({
      config: mockConfig,
      context: new ContextManager(),
      cwd: '/proj',
      send: (ev) => { events.push(ev); },
      runChatLoop: abortingRunLoop as any,
    });

    await session.handlePrompt('x');

    expect(events.some((e) =>
      e.type === 'message' && e.role === 'assistant' && e.content === '[aborted]'
    )).toBe(true);
    expect(events[events.length - 1]!.type).toBe('done');
  });
});
