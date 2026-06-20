import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { searchFilesTool } from '../src/file/search.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'awecode-search-test-'));
  await writeFile(
    join(tmpDir, 'a.ts'),
    'export function foo() {\n  return 1;\n}\n',
    'utf-8',
  );
  await writeFile(
    join(tmpDir, 'b.ts'),
    'export function bar() {\n  return foo();\n}\n',
    'utf-8',
  );
  await mkdir(join(tmpDir, 'sub'), { recursive: true });
  await writeFile(
    join(tmpDir, 'sub', 'c.ts'),
    'const x = foo();\n',
    'utf-8',
  );
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('searchFilesTool', () => {
  it('finds matches across files', async () => {
    const result = await searchFilesTool({
      pattern: 'foo',
      path: tmpDir,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output).toContain('a.ts');
      expect(result.output).toContain('b.ts');
      expect(result.output).toContain('sub/c.ts');
    }
  });

  it('supports regex patterns', async () => {
    const result = await searchFilesTool({
      pattern: 'function \\w+',
      path: tmpDir,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output).toContain('function foo');
      expect(result.output).toContain('function bar');
    }
  });

  it('returns empty on no matches', async () => {
    const result = await searchFilesTool({
      pattern: 'nomatch_xyz',
      path: tmpDir,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output.trim()).toBe('');
  });
});
