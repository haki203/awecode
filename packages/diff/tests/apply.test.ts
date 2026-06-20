import { describe, it, expect } from 'vitest';
import { applyDiff } from '../src/apply.js';
import type { DiffBlock } from '../src/types.js';

describe('applyDiff', () => {
  const source = `line1
line2
line3
line4
line5`;

  it('applies exact match replace', () => {
    const blocks: DiffBlock[] = [
      { search: 'line2\nline3\n', replace: 'LINE2\nLINE3\n' },
    ];
    const r = applyDiff(source, blocks);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result).toBe('line1\nLINE2\nLINE3\nline4\nline5');
  });

  it('inserts at anchor when search empty', () => {
    const blocks: DiffBlock[] = [
      {
        search: '',
        replace: 'inserted\n',
        anchor: { type: 'after', symbol: 'line2' },
      },
    ];
    const r = applyDiff(source, blocks);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result).toContain('inserted');
  });

  it('returns no_match with suggestions on bad search', () => {
    const blocks: DiffBlock[] = [
      { search: 'completely missing', replace: 'whatever' },
    ];
    const r = applyDiff(source, blocks);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('no_match');
  });

  it('returns anchor_not_found when symbol missing', () => {
    const blocks: DiffBlock[] = [
      {
        search: '',
        replace: 'x',
        anchor: { type: 'after', symbol: 'missingSymbol' },
      },
    ];
    const r = applyDiff(source, blocks);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('anchor_not_found');
  });

  it('applies multiple blocks sequentially', () => {
    const blocks: DiffBlock[] = [
      { search: 'line1\n', replace: 'LINE1\n' },
      { search: 'line5', replace: 'LINE5' },
    ];
    const r = applyDiff(source, blocks);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result).toContain('LINE1');
      expect(r.result).toContain('LINE5');
    }
  });
});
