import { describe, it, expect } from 'vitest';
import type { ParsedSymbol, SymbolKind, RankedFile, RankedSymbol, RepoMapCacheData } from '../src/types.js';

describe('repomap types', () => {
  it('ParsedSymbol has name, kind, signature, startLine', () => {
    const s: ParsedSymbol = {
      name: 'foo',
      kind: 'function',
      signature: 'function foo(): void',
      startLine: 10,
    };
    expect(s.kind).toBe('function');
  });

  it('SymbolKind includes function/class/method/variable', () => {
    const kinds: SymbolKind[] = ['function', 'class', 'method', 'variable'];
    expect(kinds).toHaveLength(4);
  });

  it('RankedFile has path + symbols', () => {
    const f: RankedFile = {
      path: 'src/foo.ts',
      symbols: [],
    };
    expect(f.path).toBe('src/foo.ts');
  });

  it('RankedSymbol has name, signature, rank', () => {
    const s: RankedSymbol = {
      name: 'foo',
      signature: 'function foo()',
      rank: 0.85,
    };
    expect(s.rank).toBeGreaterThan(0);
  });

  it('RepoMapCacheData has commitHash + files', () => {
    const d: RepoMapCacheData = {
      commitHash: 'abc123',
      files: [],
    };
    expect(d.commitHash).toBe('abc123');
  });
});
