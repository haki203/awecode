import { describe, it, expect } from 'vitest';
import type { DiffBlock, ParsedDiff } from '../src/types.js';

describe('types', () => {
  it('DiffBlock has search and replace', () => {
    const b: DiffBlock = {
      search: 'function foo() {}',
      replace: 'function foo() { return 1; }',
    };
    expect(b.search).toBe('function foo() {}');
  });

  it('DiffBlock has optional anchor', () => {
    const b: DiffBlock = {
      search: '',
      replace: 'new code',
      anchor: { type: 'after', symbol: 'function foo' },
    };
    expect(b.anchor?.type).toBe('after');
  });

  it('ParsedDiff has filePath and blocks', () => {
    const p: ParsedDiff = {
      filePath: 'src/foo.ts',
      blocks: [],
    };
    expect(p.filePath).toBe('src/foo.ts');
  });
});
