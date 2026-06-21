import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('persistence/sessions', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'awecode-test-'));
    process.env.AWECODE_SESSIONS_DIR = dir;
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.AWECODE_SESSIONS_DIR;
  });

  it('round-trips a session via saveSession/loadSession', async () => {
    const { saveSession, loadSession } = await import('../../src/persistence/sessions.js');
    const s = {
      id: 'abc', title: 't', createdAt: 1, updatedAt: 2, cwd: '/x',
      messages: [{ role: 'user' as const, content: 'hi', ts: 3 }],
    };
    saveSession(s);
    const got = loadSession('abc');
    expect(got).toEqual(s);
  });

  it('listSessionsInWorkspace filters by exact cwd', async () => {
    const { saveSession, listSessionsInWorkspace } = await import('../../src/persistence/sessions.js');
    saveSession({ id: 'a', title: 'a', createdAt: 1, updatedAt: 1, cwd: '/proj1', messages: [] });
    saveSession({ id: 'b', title: 'b', createdAt: 1, updatedAt: 1, cwd: '/proj2', messages: [] });
    const list = listSessionsInWorkspace('/proj1');
    expect(list.map((m) => m.id)).toEqual(['a']);
  });

  it('deleteSession of nonexistent id does not throw', async () => {
    const { deleteSession } = await import('../../src/persistence/sessions.js');
    expect(() => deleteSession('nonexistent')).not.toThrow();
  });
});
