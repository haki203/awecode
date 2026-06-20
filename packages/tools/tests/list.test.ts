import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listFilesTool } from '../src/file/list.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'awecode-list-test-'));
  // Create sample files
  await writeFile(join(tmpDir, 'a.ts'), '', 'utf-8');
  await writeFile(join(tmpDir, 'b.ts'), '', 'utf-8');
  await writeFile(join(tmpDir, 'c.js'), '', 'utf-8');
  await mkdir(join(tmpDir, 'sub'), { recursive: true });
  await writeFile(join(tmpDir, 'sub', 'd.ts'), '', 'utf-8');
  await mkdir(join(tmpDir, 'node_modules'), { recursive: true });
  await writeFile(join(tmpDir, 'node_modules', 'dep.ts'), '', 'utf-8');
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('listFilesTool', () => {
  it('lists .ts files recursively', async () => {
    const result = await listFilesTool({ pattern: '**/*.ts', cwd: tmpDir });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const files = result.output.split('\n').filter(Boolean);
      expect(files).toContain('a.ts');
      expect(files).toContain('b.ts');
      expect(files).toContain('sub/d.ts');
    }
  });

  it('excludes node_modules by default', async () => {
    const result = await listFilesTool({ pattern: '**/*.ts', cwd: tmpDir });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output).not.toContain('node_modules');
    }
  });

  it('returns empty on no matches', async () => {
    const result = await listFilesTool({ pattern: '**/*.rs', cwd: tmpDir });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output.trim()).toBe('');
  });

  it('lists .js files', async () => {
    const result = await listFilesTool({ pattern: '**/*.js', cwd: tmpDir });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output).toContain('c.js');
    }
  });
});
