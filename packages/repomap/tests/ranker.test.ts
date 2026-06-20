import { describe, it, expect } from 'vitest';
import { rankSymbols } from '../src/ranker.js';
import type { ParsedSymbol } from '../src/types.js';

describe('rankSymbols', () => {
  it('returns empty for empty input', () => {
    const result = rankSymbols(new Map());
    expect(result).toEqual([]);
  });

  it('returns RankedFile per file', () => {
    const files = new Map<string, ParsedSymbol[]>([
      ['a.ts', [{ name: 'foo', kind: 'function', signature: 'function foo()', startLine: 1 }]],
      ['b.ts', [{ name: 'bar', kind: 'function', signature: 'function bar()', startLine: 1 }]],
    ]);
    const result = rankSymbols(files);
    expect(result).toHaveLength(2);
    expect(result.map((f) => f.path).sort()).toEqual(['a.ts', 'b.ts']);
  });

  it('assigns rank between 0 and 1', () => {
    const files = new Map<string, ParsedSymbol[]>([
      ['a.ts', [{ name: 'foo', kind: 'function', signature: 'function foo()', startLine: 1 }]],
    ]);
    const result = rankSymbols(files);
    for (const sym of result[0]!.symbols) {
      expect(sym.rank).toBeGreaterThan(0);
      expect(sym.rank).toBeLessThanOrEqual(1);
    }
  });

  it('symbols referenced more get higher rank', () => {
    const files = new Map<string, ParsedSymbol[]>([
      [
        'a.ts',
        [
          { name: 'usedEverywhere', kind: 'function', signature: 'function usedEverywhere()', startLine: 1 },
          { name: 'lonely', kind: 'function', signature: 'function lonely()', startLine: 10 },
        ],
      ],
      [
        'b.ts',
        [
          { name: 'usedEverywhere', kind: 'function', signature: 'function usedEverywhere()', startLine: 1 },
          { name: 'usedEverywhere', kind: 'function', signature: 'function usedEverywhere()', startLine: 5 },
        ],
      ],
    ]);
    const result = rankSymbols(files);
    const fileA = result.find((f) => f.path === 'a.ts')!;
    const used = fileA.symbols.find((s) => s.name === 'usedEverywhere');
    const lonely = fileA.symbols.find((s) => s.name === 'lonely');
    expect(used!.rank).toBeGreaterThan(lonely!.rank);
  });
});
