import { describe, it, expect } from 'vitest';
import {
  createFileEntry,
  createCommandOutputEntry,
  createDiffEntry,
} from '../src/context/entry.js';

describe('ContextEntry factories', () => {
  it('createFileEntry generates id, computes tokens', () => {
    const entry = createFileEntry({
      path: '/tmp/foo.ts',
      content: 'export function foo() { return 1; }',
      addedBy: 'user',
    });
    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(entry.type).toBe('file');
    expect(entry.path).toBe('/tmp/foo.ts');
    expect(entry.tokens).toBeGreaterThan(0);
    expect(entry.addedBy).toBe('user');
    expect(entry.addedAt).toBeGreaterThan(0);
  });

  it('createFileEntry supports partial lines', () => {
    const entry = createFileEntry({
      path: '/tmp/foo.ts',
      content: 'line2\nline3',
      lines: { start: 2, end: 3 },
      addedBy: 'agent',
    });
    expect(entry.lines).toEqual({ start: 2, end: 3 });
  });

  it('createCommandOutputEntry', () => {
    const entry = createCommandOutputEntry({
      content: 'test output',
    });
    expect(entry.type).toBe('command-output');
    expect(entry.content).toBe('test output');
  });

  it('createDiffEntry', () => {
    const entry = createDiffEntry({
      content: '<<<< SEARCH\nold\n====\nnew\n>>>> REPLACE',
    });
    expect(entry.type).toBe('diff');
  });
});
