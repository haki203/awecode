import { describe, it, expect } from 'vitest';
import { parseAssistantDiff } from '../src/diff-interceptor.js';

describe('parseAssistantDiff', () => {
  it('returns empty array when no diff blocks in text', () => {
    const r = parseAssistantDiff('just regular text, no diff');
    expect(r).toEqual([]);
  });

  it('parses single diff block', () => {
    const text = `file_path: foo.ts
<<<< SEARCH
old
====
new
>>>> REPLACE`;
    const r = parseAssistantDiff(text);
    expect(r).toHaveLength(1);
    expect(r[0]?.filePath).toBe('foo.ts');
    expect(r[0]?.parsed.filePath).toBe('foo.ts');
    expect(r[0]?.parsed.blocks).toHaveLength(1);
    expect(r[0]?.parsed.blocks[0]?.search).toBe('old\n');
    expect(r[0]?.parsed.blocks[0]?.replace).toBe('new\n');
  });

  it('parses multiple diff blocks for different files', () => {
    const text = `file_path: a.ts
<<<< SEARCH
x
====
y
>>>> REPLACE
file_path: b.ts
<<<< SEARCH
p
====
q
>>>> REPLACE`;
    const r = parseAssistantDiff(text);
    expect(r).toHaveLength(2);
    expect(r[0]?.filePath).toBe('a.ts');
    expect(r[1]?.filePath).toBe('b.ts');
  });
});
