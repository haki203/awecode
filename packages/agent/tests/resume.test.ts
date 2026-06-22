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
import { resumeFromMessages } from '../src/resume.js';
import type { SessionMessage } from '../src/persistence/sessions.js';

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
});
