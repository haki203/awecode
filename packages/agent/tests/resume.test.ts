// Copyright 2026 Awecode Contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { describe, it, expect } from 'vitest';
import { resumeFromMessages, rebuildContextFromSession } from '../src/resume.js';
import { ContextManager } from '../src/context/manager.js';
import type { SessionMessage, ContextEntryRecord } from '../src/persistence/sessions.js';

describe('resumeFromMessages', () => {
  it('returns empty for empty input', () => {
    expect(resumeFromMessages([])).toEqual([]);
  });

  it('passes through user and assistant messages', () => {
    const msgs: SessionMessage[] = [
      { role: 'user', content: 'hi', ts: 1 },
      { role: 'assistant', content: 'hello', ts: 2 },
    ];
    const out = resumeFromMessages(msgs);
    expect(out).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]);
  });

  it('filters out error messages', () => {
    const msgs: SessionMessage[] = [
      { role: 'user', content: 'hi', ts: 1 },
      { role: 'error', content: 'boom', ts: 2 },
      { role: 'assistant', content: 'recovered', ts: 3 },
    ];
    const out = resumeFromMessages(msgs);
    expect(out).toHaveLength(2);
    expect(out.find((m) => m.role === 'error')).toBeUndefined();
  });

  it('emits a ToolModelMessage combining a tool_call marker and its result', () => {
    const msgs: SessionMessage[] = [
      { role: 'user', content: 'read file', ts: 1 },
      { role: 'tool', content: 'call read_file', ts: 2, toolCallId: 'c1', toolName: 'read_file' },
      { role: 'tool', content: '{"lines":["x"]}', ts: 3, toolCallId: 'c1', toolName: 'read_file' },
      { role: 'assistant', content: 'The file contains x', ts: 4 },
    ];
    const out = resumeFromMessages(msgs);
    // 3 messages: user, tool (combined), assistant
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ role: 'user', content: 'read file' });
    expect(out[1]!.role).toBe('tool');
    // ToolModelMessage content is an array of ToolResultPart.
    const toolMsg = out[1] as { role: 'tool'; content: Array<Record<string, unknown>> };
    expect(toolMsg.content).toHaveLength(1);
    expect(toolMsg.content[0]!.type).toBe('tool-result');
    expect(toolMsg.content[0]!.toolName).toBe('read_file');
    expect(toolMsg.content[0]!.toolCallId).toBe('c1');
    expect(out[2]).toEqual({ role: 'assistant', content: 'The file contains x' });
  });

  it('skips a tool_call marker with no paired result (incomplete turn)', () => {
    const msgs: SessionMessage[] = [
      { role: 'user', content: 'read', ts: 1 },
      { role: 'tool', content: 'call read_file', ts: 2, toolCallId: 'c1', toolName: 'read_file' },
      // No result — session saved mid-call.
    ];
    const out = resumeFromMessages(msgs);
    expect(out).toEqual([{ role: 'user', content: 'read' }]);
  });

  it('handles multiple sequential tool calls', () => {
    const msgs: SessionMessage[] = [
      { role: 'user', content: 'multi', ts: 1 },
      { role: 'tool', content: 'call read_file', ts: 2, toolCallId: 'a', toolName: 'read_file' },
      { role: 'tool', content: 'r1', ts: 3, toolCallId: 'a', toolName: 'read_file' },
      { role: 'tool', content: 'call shell_exec', ts: 4, toolCallId: 'b', toolName: 'shell_exec' },
      { role: 'tool', content: 'r2', ts: 5, toolCallId: 'b', toolName: 'shell_exec' },
      { role: 'assistant', content: 'done', ts: 6 },
    ];
    const out = resumeFromMessages(msgs);
    expect(out).toHaveLength(4); // user, tool1, tool2, assistant
    expect(out.filter((m) => m.role === 'tool')).toHaveLength(2);
  });

  it('best-effort pairs legacy messages without toolCallId', () => {
    const msgs: SessionMessage[] = [
      { role: 'user', content: 'x', ts: 1 },
      { role: 'tool', content: 'call read_file', ts: 2 },
      { role: 'tool', content: 'some result', ts: 3 },
    ];
    const out = resumeFromMessages(msgs);
    // The marker and result should still be combined into one tool message.
    expect(out).toHaveLength(2);
    expect(out[1]!.role).toBe('tool');
  });

  it('handles parallel tool calls (markers before results, interleaved)', () => {
    // AI SDK can emit parallel tool calls: [markerA, markerB, resultA, resultB].
    // Both pairs must be correctly correlated via toolCallId, even though
    // neither result immediately follows its marker.
    const msgs: SessionMessage[] = [
      { role: 'user', content: 'parallel', ts: 1 },
      { role: 'tool', content: 'call read_file', ts: 2, toolCallId: 'a', toolName: 'read_file' },
      { role: 'tool', content: 'call shell_exec', ts: 3, toolCallId: 'b', toolName: 'shell_exec' },
      { role: 'tool', content: 'resultA', ts: 4, toolCallId: 'a', toolName: 'read_file' },
      { role: 'tool', content: 'resultB', ts: 5, toolCallId: 'b', toolName: 'shell_exec' },
      { role: 'assistant', content: 'done', ts: 6 },
    ];
    const out = resumeFromMessages(msgs);
    // Expect: user, toolA, toolB, assistant
    expect(out).toHaveLength(4);
    expect(out.filter((m) => m.role === 'tool')).toHaveLength(2);
    const toolMessages = out.filter((m) => m.role === 'tool') as Array<{
      role: 'tool';
      content: Array<{ toolCallId: string; toolName: string; output: { value: string } }>;
    }>;
    // toolA: read_file with resultA
    expect(toolMessages[0]!.content[0]!.toolCallId).toBe('a');
    expect(toolMessages[0]!.content[0]!.toolName).toBe('read_file');
    expect(toolMessages[0]!.content[0]!.output.value).toBe('resultA');
    // toolB: shell_exec with resultB
    expect(toolMessages[1]!.content[0]!.toolCallId).toBe('b');
    expect(toolMessages[1]!.content[0]!.toolName).toBe('shell_exec');
    expect(toolMessages[1]!.content[0]!.output.value).toBe('resultB');
  });
});

describe('rebuildContextFromSession', () => {
  it('restores from session.contextEntries when available (preferred path)', () => {
    const cm = new ContextManager(100_000);
    cm.addUserMessage('stale'); // should be cleared by rebuild
    expect(cm.entryCount).toBe(1);

    const records: ContextEntryRecord[] = [
      {
        id: 'r1',
        type: 'user-message',
        content: 'hello',
        tokens: 5,
        addedAt: 100,
        addedBy: 'user',
      },
      {
        id: 'r2',
        type: 'assistant-message',
        content: 'world',
        tokens: 8,
        addedAt: 101,
        addedBy: 'agent',
      },
    ];

    rebuildContextFromSession(
      { messages: [], contextEntries: records, contextBudgetTokens: 200_000 },
      cm,
    );

    expect(cm.entryCount).toBe(2);
    expect(cm.totalTokens).toBe(13); // 5 + 8
    expect(cm.budgetTokens).toBe(200_000);
    expect(cm.snapshot()[0]!.content).toBe('hello');
  });

  it('falls back to reconstructing from messages[] for legacy sessions', () => {
    const cm = new ContextManager(100_000);
    const messages: SessionMessage[] = [
      { role: 'user', content: 'hi', ts: 1 },
      { role: 'assistant', content: 'hello there', ts: 2 },
      { role: 'tool', content: 'call read_file', ts: 3, toolName: 'read_file' },
      { role: 'tool', content: '{"lines":["x"]}', ts: 4, toolName: 'read_file' },
      { role: 'assistant', content: 'done', ts: 5 },
    ];

    rebuildContextFromSession({ messages }, cm);

    // 4 entries: user, assistant, tool-result (skip the "call ..." marker),
    // assistant. Error messages would also be skipped.
    expect(cm.entryCount).toBe(4);
    const types = cm.snapshot().map((e) => e.type);
    expect(types).toEqual([
      'user-message',
      'assistant-message',
      'tool-result',
      'assistant-message',
    ]);
    // Tokens were recomputed by gpt-tokenizer — just verify non-zero.
    expect(cm.totalTokens).toBeGreaterThan(0);
    // Budget preserved (fallback doesn't touch it).
    expect(cm.budgetTokens).toBe(100_000);
  });

  it('clears existing entries before restore (no duplicates on repeated resume)', () => {
    const cm = new ContextManager();
    const records: ContextEntryRecord[] = [
      { id: 'a', type: 'user-message', content: 'x', tokens: 1, addedAt: 1, addedBy: 'user' },
    ];

    rebuildContextFromSession({ messages: [], contextEntries: records }, cm);
    expect(cm.entryCount).toBe(1);

    // Resume the same session again — should NOT accumulate.
    rebuildContextFromSession({ messages: [], contextEntries: records }, cm);
    expect(cm.entryCount).toBe(1);
  });
});
