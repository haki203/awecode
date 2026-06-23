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

import { describe, it, expect, vi } from 'vitest';

// jsonSchema is a thin wrapper in the real SDK; mock it to identity so the
// test asserts on the raw schema object shape without depending on SDK internals.
vi.mock('ai', () => ({
  jsonSchema: (schema: unknown) => schema,
}));

import { buildToolSet, normalizeToolCall } from '../src/adapter.js';

describe('buildToolSet', () => {
  it('converts ToolDefinition[] into a ToolSet keyed by name', () => {
    const defs = [
      {
        name: 'read_file',
        description: 'Read a file',
        parameters: { type: 'object', properties: { path: { type: 'string' } } },
      },
      {
        name: 'list_files',
        description: 'List files',
        parameters: { type: 'object', properties: {} },
      },
    ];
    const set = buildToolSet(defs);
    expect(Object.keys(set).sort()).toEqual(['list_files', 'read_file']);
    expect((set as Record<string, { description: string }>).read_file.description).toBe('Read a file');
    expect(
      (set as Record<string, { inputSchema: unknown }>).read_file.inputSchema,
    ).toEqual({ type: 'object', properties: { path: { type: 'string' } } });
  });

  it('produces an empty object for an empty array', () => {
    expect(Object.keys(buildToolSet([]))).toHaveLength(0);
  });
});

describe('normalizeToolCall', () => {
  it('reads v6 `input` field when present', () => {
    const result = normalizeToolCall({
      toolName: 'read_file',
      input: { path: '/x' },
      toolCallId: 'call-1',
    });
    expect(result).toEqual({
      name: 'read_file',
      arguments: { path: '/x' },
      id: 'call-1',
    });
  });

  it('falls back to legacy `args` field when `input` is absent', () => {
    const result = normalizeToolCall({
      toolName: 'read_file',
      args: { path: '/y' },
    });
    expect(result.name).toBe('read_file');
    expect(result.arguments).toEqual({ path: '/y' });
    expect(result.id).toBeUndefined();
  });

  it('defaults arguments to empty object when payload is null or non-object', () => {
    const r1 = normalizeToolCall({ toolName: 'x', input: null });
    const r2 = normalizeToolCall({ toolName: 'x', args: 'not-an-object' });
    expect(r1.arguments).toEqual({});
    expect(r2.arguments).toEqual({});
  });
});
