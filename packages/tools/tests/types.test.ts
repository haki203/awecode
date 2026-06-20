import { describe, it, expect } from 'vitest';
import type {
  ToolDefinition,
  ToolCall,
  ToolResult,
} from '../src/types.js';

describe('Tool types', () => {
  it('ToolDefinition has name, description, parameters', () => {
    const def: ToolDefinition = {
      name: 'read_file',
      description: 'Read a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
        },
        required: ['path'],
      },
    };
    expect(def.name).toBe('read_file');
  });

  it('ToolCall has name and arguments', () => {
    const call: ToolCall = {
      name: 'read_file',
      arguments: { path: '/tmp/foo.ts' },
    };
    expect(call.name).toBe('read_file');
    expect(call.arguments.path).toBe('/tmp/foo.ts');
  });

  it('ToolResult success has output', () => {
    const r: ToolResult = {
      ok: true,
      output: 'file contents',
    };
    expect(r.ok).toBe(true);
  });

  it('ToolResult failure has error', () => {
    const r: ToolResult = {
      ok: false,
      error: 'File not found',
    };
    expect(r.ok).toBe(false);
  });

  it('ToolResult success can carry contextEntries', () => {
    const r: ToolResult = {
      ok: true,
      output: 'content',
      contextEntries: [
        { type: 'file', path: '/tmp/foo.ts', content: 'content' },
      ],
    };
    expect(r.contextEntries?.[0]?.type).toBe('file');
  });
});
