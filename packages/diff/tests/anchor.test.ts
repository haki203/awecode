import { describe, it, expect } from 'vitest';
import { resolveAnchor } from '../src/anchor.js';

const source = `function foo() {
  return 1;
}

class Bar {
  method() {}
}

function baz() {
  return 2;
}`;

describe('resolveAnchor', () => {
  it('finds function symbol @after', () => {
    const r = resolveAnchor(source, { type: 'after', symbol: 'function foo' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.line).toBe(3);
  });

  it('finds class symbol @before', () => {
    const r = resolveAnchor(source, { type: 'before', symbol: 'class Bar' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.line).toBe(4);
  });

  it('returns not_found with suggestions when symbol missing', () => {
    const r = resolveAnchor(source, { type: 'after', symbol: 'function qux' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe('not_found');
      expect(r.suggestions).toContain('function foo');
    }
  });
});
