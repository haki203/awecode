import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getCachePath,
  loadCachedMap,
  saveCachedMap,
  getOrGenerateMap,
} from '../src/cache.js';

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => ({
    revparse: vi.fn().mockResolvedValue('fake-hash-123'),
  })),
}));

let tmpProject: string;

beforeEach(async () => {
  tmpProject = await mkdtemp(join(tmpdir(), 'awecode-cache-test-'));
});

afterEach(async () => {
  await rm(tmpProject, { recursive: true, force: true });
});

describe('getCachePath', () => {
  it('returns .awecode/cache/repo-map.json', () => {
    const p = getCachePath(tmpProject);
    expect(p.replace(/\\/g, '/')).toMatch(/\.awecode\/cache\/repo-map\.json$/);
  });
});

describe('loadCachedMap', () => {
  it('returns null when no cache file', async () => {
    const result = await loadCachedMap(tmpProject);
    expect(result).toBeNull();
  });

  it('loads saved cache', async () => {
    await saveCachedMap(tmpProject, {
      commitHash: 'abc123',
      files: [{ path: 'foo.ts', symbols: [] }],
    });
    const result = await loadCachedMap(tmpProject);
    expect(result).not.toBeNull();
    expect(result!.commitHash).toBe('abc123');
  });
});

describe('getOrGenerateMap', () => {
  it('generates when no cache', async () => {
    const generator = vi.fn().mockResolvedValue([
      { path: 'generated.ts', symbols: [] },
    ]);
    const result = await getOrGenerateMap(tmpProject, generator);
    expect(generator).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0]!.path).toBe('generated.ts');
  });

  it('returns cache when commit hash matches', async () => {
    await saveCachedMap(tmpProject, {
      commitHash: 'fake-hash-123',
      files: [{ path: 'cached.ts', symbols: [] }],
    });

    const generator = vi.fn().mockResolvedValue([]);
    const result = await getOrGenerateMap(tmpProject, generator);
    expect(generator).not.toHaveBeenCalled();
    expect(result[0]!.path).toBe('cached.ts');
  });

  it('regenerates when commit hash differs', async () => {
    await saveCachedMap(tmpProject, {
      commitHash: 'different-hash',
      files: [],
    });

    const generator = vi.fn().mockResolvedValue([
      { path: 'fresh.ts', symbols: [] },
    ]);
    const result = await getOrGenerateMap(tmpProject, generator);
    expect(generator).toHaveBeenCalled();
    expect(result[0]!.path).toBe('fresh.ts');
  });
});
