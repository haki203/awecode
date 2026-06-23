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

  it('surfaces empty-stream errors as error events (Bug 1 regression guard for GUI/PWA)', async () => {
    // The real runChatLoop now throws when the stream yields no assistant
    // text. protocol-session's catch block must forward that throw as an
    // `error` event so GUI/PWA users see the failure immediately instead
    // of a silent "agent done" — mirrors the symptom the TUI had before
    // the fix. This test pins the contract end-to-end through the session.
    const events: GuiAgentEvent[] = [];
    function emptyStreamRunLoop(): Promise<ModelMessage[]> {
      return Promise.reject(
        new Error('No output generated. Check the stream for errors.'),
      );
    }

    const session = createProtocolSession({
      config: mockConfig,
      context: new ContextManager(),
      cwd: '/proj',
      send: (ev) => { events.push(ev); },
      runChatLoop: emptyStreamRunLoop as any,
    });

    await session.handlePrompt('hi');

    const errorEvent = events.find(
      (e) => e.type === 'error',
    ) as Extract<GuiAgentEvent, { type: 'error' }> | undefined;
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.message).toContain('No output generated');
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

describe('createProtocolSession with initialMessages', () => {
  it('seeds liveMessages from initialMessages (no reset on first prompt)', async () => {
    const initialMessages: ModelMessage[] = [
      { role: 'user', content: 'previous question' },
      { role: 'assistant', content: 'previous answer' },
    ];

    let capturedMessages: ModelMessage[] | null = null;
    const capturingRunLoop = (msgs: ModelMessage[]): Promise<ModelMessage[]> => {
      capturedMessages = msgs;
      return Promise.resolve(msgs);
    };

    const session = createProtocolSession({
      config: mockConfig,
      context: new ContextManager(),
      cwd: '/x',
      send: () => {},
      runChatLoop: capturingRunLoop as any,
      initialMessages,
    });

    await session.handlePrompt('follow-up question');

    expect(capturedMessages).not.toBeNull();
    // Seed (2) + new user prompt (1) = at least 3 entries before runChatLoop returns.
    expect(capturedMessages!.length).toBeGreaterThanOrEqual(3);
    expect(capturedMessages!.find((m) => m.role === 'user' && m.content === 'previous question'))
      .toBeDefined();
    expect(capturedMessages!.find((m) => m.role === 'assistant' && m.content === 'previous answer'))
      .toBeDefined();
    expect(capturedMessages!.find((m) => m.role === 'user' && m.content === 'follow-up question'))
      .toBeDefined();
  });

  it('starts with empty liveMessages when initialMessages is omitted', async () => {
    let capturedMessages: ModelMessage[] | null = null;
    const capturingRunLoop = (msgs: ModelMessage[]): Promise<ModelMessage[]> => {
      capturedMessages = msgs;
      return Promise.resolve(msgs);
    };

    const session = createProtocolSession({
      config: mockConfig,
      context: new ContextManager(),
      cwd: '/x',
      send: () => {},
      runChatLoop: capturingRunLoop as any,
    });

    await session.handlePrompt('first message');

    expect(capturedMessages).toHaveLength(1);
    expect(capturedMessages![0]).toEqual({ role: 'user', content: 'first message' });
  });

  it('resume() method appends messages to liveMessages', async () => {
    let capturedMessages: ModelMessage[] | null = null;
    const capturingRunLoop = (msgs: ModelMessage[]): Promise<ModelMessage[]> => {
      capturedMessages = msgs;
      return Promise.resolve(msgs);
    };

    const session = createProtocolSession({
      config: mockConfig,
      context: new ContextManager(),
      cwd: '/x',
      send: () => {},
      runChatLoop: capturingRunLoop as any,
    });

    // Seed via resume() before any prompt
    session.resume([
      { role: 'user', content: 'resumed question' },
      { role: 'assistant', content: 'resumed answer' },
    ]);

    await session.handlePrompt('new question');

    expect(capturedMessages!.length).toBeGreaterThanOrEqual(3);
    expect(capturedMessages!.find((m) => m.role === 'user' && m.content === 'resumed question'))
      .toBeDefined();
    expect(capturedMessages!.find((m) => m.role === 'assistant' && m.content === 'resumed answer'))
      .toBeDefined();
    expect(capturedMessages!.find((m) => m.role === 'user' && m.content === 'new question'))
      .toBeDefined();
  });

  it('resume() is idempotent when called with the same seed twice', async () => {
    let capturedMessages: ModelMessage[] | null = null;
    const capturingRunLoop = (msgs: ModelMessage[]): Promise<ModelMessage[]> => {
      capturedMessages = msgs;
      return Promise.resolve(msgs);
    };

    const seed: ModelMessage[] = [
      { role: 'user', content: 'dup question' },
      { role: 'assistant', content: 'dup answer' },
    ];

    const session = createProtocolSession({
      config: mockConfig,
      context: new ContextManager(),
      cwd: '/x',
      send: () => {},
      runChatLoop: capturingRunLoop as any,
      initialMessages: seed,
    });

    // Calling resume() with the same array references should NOT duplicate.
    session.resume(seed);

    await session.handlePrompt('next');

    // seed (2) + new prompt (1) = 3, NOT 5
    expect(capturedMessages!.length).toBe(3);
  });
});
