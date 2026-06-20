import { describe, it, expect } from 'vitest';
import { parseFile } from '../src/parser.js';

describe('parseFile', () => {
  it('parses TypeScript function', async () => {
    const content = `export function foo(x: number): string {
  return String(x);
}
`;
    const result = await parseFile('test.ts', content);
    expect('symbols' in result).toBe(true);
    if ('symbols' in result) {
      const fn = result.symbols.find((s) => s.name === 'foo');
      expect(fn).toBeDefined();
      expect(fn!.kind).toBe('function');
    }
  });

  it('parses TypeScript class with methods', async () => {
    const content = `class Foo {
  bar(): void {}
  baz(): number { return 1; }
}
`;
    const result = await parseFile('test.ts', content);
    if ('symbols' in result) {
      const cls = result.symbols.find((s) => s.name === 'Foo');
      expect(cls).toBeDefined();
      expect(cls!.kind).toBe('class');
    }
  });

  it('returns unsupported for unknown extension', async () => {
    const result = await parseFile('README.md', '# Hello');
    expect('unsupported' in result).toBe(true);
  });

  it('returns unsupported for .yaml files', async () => {
    const result = await parseFile('config.yaml', 'key: value');
    expect('unsupported' in result).toBe(true);
  });

  it('parses Python function', async () => {
    const content = `def foo(x):
    return x
`;
    const result = await parseFile('test.py', content);
    if ('symbols' in result) {
      const fn = result.symbols.find((s) => s.name === 'foo');
      expect(fn).toBeDefined();
    }
  });
});
