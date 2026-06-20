import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileTool } from '../src/file/read.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'awecode-tools-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('readFileTool', () => {
  it('reads full file content', async () => {
    const filePath = join(tmpDir, 'foo.ts');
    await writeFile(filePath, 'line1\nline2\nline3\n', 'utf-8');

    const result = await readFileTool({ path: filePath });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output).toBe('line1\nline2\nline3\n');
      expect(result.contextEntries?.[0]?.type).toBe('file');
      expect(result.contextEntries?.[0]?.path).toBe(filePath);
    }
  });

  it('reads partial file with lines range', async () => {
    const filePath = join(tmpDir, 'foo.ts');
    await writeFile(filePath, 'line1\nline2\nline3\nline4\nline5\n', 'utf-8');

    const result = await readFileTool({
      path: filePath,
      lines: { start: 2, end: 4 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output).toBe('line2\nline3\nline4\n');
    }
  });

  it('returns error on missing file', async () => {
    const result = await readFileTool({ path: join(tmpDir, 'nonexistent.ts') });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Failed to read/);
    }
  });

  it('handles empty file', async () => {
    const filePath = join(tmpDir, 'empty.ts');
    await writeFile(filePath, '', 'utf-8');

    const result = await readFileTool({ path: filePath });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output).toBe('');
  });
});
