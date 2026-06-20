import { describe, it, expect } from 'vitest';
import { fuzzyMatch } from '../src/fuzzy.js';

describe('fuzzyMatch', () => {
  const text = `function foo() {
  return 1;
}
function bar() {
  return 2;
}`;

  it('exact match returns position 0', () => {
    const r = fuzzyMatch(text, 'function foo() {\n  return 1;\n}');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.startLine).toBe(0);
  });

  it('whitespace-insensitive match', () => {
    const r = fuzzyMatch(text, 'function foo() {\n    return 1;\n}');
    expect(r.ok).toBe(true);
  });

  it('returns no_match with score when below threshold', () => {
    const r = fuzzyMatch(text, 'completely different text', 0.85);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.bestScore).toBeLessThan(0.85);
  });

  it('returns ambiguous when multiple matches', () => {
    const text2 = 'x\nx\nx';
    const r = fuzzyMatch(text2, 'x');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('ambiguous');
  });
});
