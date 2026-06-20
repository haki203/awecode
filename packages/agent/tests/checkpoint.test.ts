import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveCheckpoint, loadCheckpoint, listCheckpoints } from '../src/context/checkpoint.js';
import type { ContextEntry } from '../src/context/entry.js';

let tmpProject: string;

beforeEach(async () => {
  tmpProject = await mkdtemp(join(tmpdir(), 'awecode-checkpoint-'));
});

afterEach(async () => {
  await rm(tmpProject, { recursive: true, force: true });
});

describe('saveCheckpoint + loadCheckpoint', () => {
  it('saves and loads roundtrip', async () => {
    const entries: ContextEntry[] = [
      {
        id: '1',
        type: 'file',
        path: '/x.ts',
        content: 'x',
        tokens: 1,
        addedAt: Date.now(),
        addedBy: 'user',
      },
    ];
    const id = await saveCheckpoint(tmpProject, {
      timestamp: '2026-06-19T17:00:00Z',
      trigger: 'manual /smol',
      preCompactTokens: 100,
      entries,
      conversationHistory: [{ role: 'user', content: 'hi' }],
    });

    expect(id).toBeTruthy();

    const loaded = await loadCheckpoint(tmpProject, id);
    expect(loaded).not.toBeNull();
    expect(loaded!.entries).toHaveLength(1);
    expect(loaded!.preCompactTokens).toBe(100);
  });

  it('returns null on missing checkpoint', async () => {
    const loaded = await loadCheckpoint(tmpProject, 'nonexistent-id');
    expect(loaded).toBeNull();
  });
});

describe('listCheckpoints', () => {
  it('returns empty when no checkpoints', async () => {
    const list = await listCheckpoints(tmpProject);
    expect(list).toEqual([]);
  });

  it('lists saved checkpoint ids', async () => {
    const id = await saveCheckpoint(tmpProject, {
      timestamp: '2026-06-19T17:00:00Z',
      trigger: 'auto-compact',
      preCompactTokens: 50,
      entries: [],
      conversationHistory: [],
    });

    const list = await listCheckpoints(tmpProject);
    expect(list).toContain(id);
  });
});
