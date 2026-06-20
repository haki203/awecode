import { describe, it, expect } from 'vitest';
import { renderRepoMap } from '../src/render.js';
import type { RankedFile } from '../src/types.js';

describe('renderRepoMap', () => {
  it('renders empty map', () => {
    const result = renderRepoMap([], 1024);
    expect(result).toBe('');
  });

  it('renders file header and symbols', () => {
    const files: RankedFile[] = [
      {
        path: 'src/foo.ts',
        symbols: [
          { name: 'foo', signature: 'function foo(): void', rank: 0.9 },
          { name: 'bar', signature: 'function bar(): number', rank: 0.5 },
        ],
      },
    ];
    const result = renderRepoMap(files, 1024);
    expect(result).toContain('src/foo.ts');
    expect(result).toContain('function foo(): void');
    expect(result).toContain('function bar(): number');
  });

  it('stops at token budget', () => {
    const files: RankedFile[] = [
      {
        path: 'big.ts',
        symbols: Array.from({ length: 50 }, (_, i) => ({
          name: `fn${i}`,
          signature: `function fn${i}()`,
          rank: 1 - i * 0.01,
        })),
      },
    ];
    const result = renderRepoMap(files, 30);
    const fnCount = (result.match(/function fn\d+/g) || []).length;
    expect(fnCount).toBeLessThan(50);
    expect(fnCount).toBeGreaterThan(0);
  });
});
