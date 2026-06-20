import { describe, it, expect } from 'vitest';
import { parseDiff } from '../src/parse.js';

describe('parseDiff', () => {
  it('parses single file single block', () => {
    const input = `file_path: src/foo.ts
<<<< SEARCH
old code
====
new code
>>>> REPLACE`;
    const result = parseDiff(input);
    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe('src/foo.ts');
    expect(result[0].blocks).toHaveLength(1);
    expect(result[0].blocks[0].search).toBe('old code\n');
    expect(result[0].blocks[0].replace).toBe('new code\n');
  });

  it('parses multiple blocks in one file', () => {
    const input = `file_path: src/foo.ts
<<<< SEARCH
old1
====
new1
>>>> REPLACE
<<<< SEARCH
old2
====
new2
>>>> REPLACE`;
    const result = parseDiff(input);
    expect(result[0].blocks).toHaveLength(2);
  });

  it('parses anchor header', () => {
    const input = `file_path: src/foo.ts
at: @after: function bar
<<<< SEARCH
====
new code
>>>> REPLACE`;
    const result = parseDiff(input);
    expect(result[0].blocks[0].anchor).toEqual({
      type: 'after',
      symbol: 'function bar',
    });
  });

  it('parses multiple file sections', () => {
    const input = `file_path: a.ts
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
    const result = parseDiff(input);
    expect(result).toHaveLength(2);
    expect(result[0].filePath).toBe('a.ts');
    expect(result[1].filePath).toBe('b.ts');
  });

  it('returns empty array on no diff markers', () => {
    expect(parseDiff('just text')).toEqual([]);
  });
});
