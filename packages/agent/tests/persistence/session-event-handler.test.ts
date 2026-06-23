// Copyright 2026 Awecode Contributors. Apache-2.0.
import { describe, it, expect } from 'vitest';
import { applyEvent } from '../../src/persistence/session-event-handler.js';
import type { Session } from '../../src/persistence/sessions.js';
import type { GuiAgentEvent } from '@awecode/gui/shared/protocol';

const emptySession: Session = {
  id: 's1', title: 'New chat', createdAt: 1, updatedAt: 1, cwd: '/x', messages: [],
};

describe('applyEvent', () => {
  it('ready updates cwd/model/provider', () => {
    const s: Session = { ...emptySession, messages: [] };
    applyEvent(s, { type: 'ready', cwd: '/y', model: 'gpt-4o', provider: 'openai' });
    expect(s.cwd).toBe('/y');
    expect(s.model).toBe('gpt-4o');
    expect(s.provider).toBe('openai');
  });

  it('message/user adds a user message and derives title', () => {
    const s: Session = { ...emptySession, messages: [] };
    applyEvent(s, { type: 'message', role: 'user', content: 'hello world' });
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0]!.role).toBe('user');
    expect(s.messages[0]!.content).toBe('hello world');
    // First user message should derive a title (NOT 'New chat' anymore).
    expect(s.title).not.toBe('New chat');
  });

  it('message/assistant adds an assistant message', () => {
    const s: Session = { ...emptySession, messages: [] };
    applyEvent(s, { type: 'message', role: 'assistant', content: 'hi' });
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0]!.role).toBe('assistant');
  });

  it('message/tool adds a tool message', () => {
    const s: Session = { ...emptySession, messages: [] };
    applyEvent(s, { type: 'message', role: 'tool', content: 'shell_exec result' });
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0]!.role).toBe('tool');
  });

  it('token appends to last assistant message (coalescing)', () => {
    const s: Session = { ...emptySession, messages: [] };
    applyEvent(s, { type: 'token', chunk: 'hel' });
    applyEvent(s, { type: 'token', chunk: 'lo' });
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0]!.role).toBe('assistant');
    expect(s.messages[0]!.content).toBe('hello');
  });

  it('tool_call pushes a synthetic tool message', () => {
    const s: Session = { ...emptySession, messages: [] };
    applyEvent(s, { type: 'tool_call', name: 'shell_exec' });
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0]!.role).toBe('tool');
    expect(s.messages[0]!.content).toContain('shell_exec');
  });

  it('done does not mutate messages', () => {
    const s: Session = { ...emptySession, messages: [] };
    applyEvent(s, { type: 'token', chunk: 'hi' });
    applyEvent(s, { type: 'done' });
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0]!.content).toBe('hi');
  });

  it('error pushes an error message', () => {
    const s: Session = { ...emptySession, messages: [] };
    applyEvent(s, { type: 'error', message: 'boom' });
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0]!.role).toBe('error');
    expect(s.messages[0]!.content).toBe('boom');
  });

  it('context_snapshot persists entries into session.contextEntries', () => {
    const s: Session = { ...emptySession, messages: [] };
    applyEvent(s, {
      type: 'context_snapshot',
      entries: [
        {
          type: 'user-message',
          label: 'user-message',
          tokens: 5,
          id: 'abc',
          content: 'hello',
          addedAt: 100,
          addedBy: 'user',
        },
        {
          type: 'assistant-message',
          label: 'assistant-message',
          tokens: 7,
          id: 'def',
          content: 'hi there',
          addedAt: 101,
          addedBy: 'agent',
        },
      ],
      totalTokens: 12,
      budgetTokens: 100_000,
    });
    expect(s.messages).toHaveLength(0); // still no message mutation
    expect(s.contextEntries).toHaveLength(2);
    expect(s.contextEntries![0]!.type).toBe('user-message');
    expect(s.contextEntries![0]!.content).toBe('hello');
    expect(s.contextEntries![0]!.tokens).toBe(5);
    expect(s.contextEntries![1]!.addedBy).toBe('agent');
    expect(s.contextBudgetTokens).toBe(100_000);
  });

  it('context_snapshot handles missing optional fields with fallbacks', () => {
    const s: Session = { ...emptySession, messages: [] };
    applyEvent(s, {
      type: 'context_snapshot',
      entries: [
        // Legacy snapshot — only type/label/tokens.
        { type: 'snippet', label: 'snippet:1-10', tokens: 3 },
      ],
      totalTokens: 3,
      budgetTokens: 50_000,
    });
    expect(s.contextEntries).toHaveLength(1);
    expect(s.contextEntries![0]!.id).toBe('restored');
    expect(s.contextEntries![0]!.content).toBe('snippet:1-10'); // falls back to label
    expect(s.contextEntries![0]!.addedBy).toBe('agent');
  });

  it('intent does not mutate messages', () => {
    const s: Session = { ...emptySession, messages: [] };
    applyEvent(s, { type: 'intent', intent: 'workflow', name: 'plan' });
    expect(s.messages).toHaveLength(0);
  });

  it('diff_detected does not mutate messages', () => {
    const s: Session = { ...emptySession, messages: [] };
    applyEvent(s, { type: 'diff_detected', diff: '<<<< SEARCH\n...' });
    expect(s.messages).toHaveLength(0);
  });

  it('always updates updatedAt timestamp', () => {
    const s: Session = { ...emptySession, updatedAt: 1 };
    applyEvent(s, { type: 'done' });
    expect(s.updatedAt).toBeGreaterThanOrEqual(1);
  });

  it('does NOT overwrite a user-set title on later user messages', () => {
    const s: Session = {
      ...emptySession,
      title: 'My custom name',
      messages: [{ role: 'user', content: 'first prompt', ts: 1 }],
    };
    applyEvent(s, { type: 'message', role: 'user', content: 'second prompt' });
    expect(s.title).toBe('My custom name');
  });

  it('derives title from first user message with markdown stripped and newlines collapsed', () => {
    const s: Session = { ...emptySession, messages: [] };
    applyEvent(s, {
      type: 'message',
      role: 'user',
      content: 'Line one\nLine two with **markdown**',
    });
    // After deriveTitle: **markdown** → markdown, newlines → spaces, first sentence (no period → no split)
    expect(s.title).toBe('Line one Line two with markdown');
  });

  it('tool_call records toolCallId and toolName', () => {
    const s: Session = { ...emptySession, messages: [] };
    applyEvent(s, { type: 'tool_call', name: 'read_file' });
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0]!.toolName).toBe('read_file');
    expect(s.messages[0]!.toolCallId).toBeTruthy();
    expect(s.messages[0]!.content).toContain('read_file');
  });

  it('correlates a tool_call with the following tool-result message via toolCallId', () => {
    const s: Session = { ...emptySession, messages: [] };
    applyEvent(s, { type: 'tool_call', name: 'read_file' });
    applyEvent(s, { type: 'message', role: 'tool', content: '{"lines":[]}' });
    expect(s.messages).toHaveLength(2);
    expect(s.messages[0]!.toolCallId).toBe(s.messages[1]!.toolCallId);
    expect(s.messages[1]!.toolName).toBe('read_file');
  });

  it('assigns distinct toolCallIds to two sequential tool calls', () => {
    const s: Session = { ...emptySession, messages: [] };
    applyEvent(s, { type: 'tool_call', name: 'read_file' });
    applyEvent(s, { type: 'message', role: 'tool', content: 'result1' });
    applyEvent(s, { type: 'tool_call', name: 'shell_exec' });
    applyEvent(s, { type: 'message', role: 'tool', content: 'result2' });
    expect(s.messages[0]!.toolCallId).not.toBe(s.messages[2]!.toolCallId);
    expect(s.messages[0]!.toolCallId).toBe(s.messages[1]!.toolCallId);
    expect(s.messages[2]!.toolCallId).toBe(s.messages[3]!.toolCallId);
  });
});
