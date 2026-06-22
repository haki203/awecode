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

  it('refuses to load a session with path-traversal characters', async () => {
    const { loadSession } = await import('../../src/persistence/sessions.js');
    expect(loadSession('../../config')).toBeNull();
    expect(loadSession('..%2Fconfig')).toBeNull();
    expect(loadSession('a/b')).toBeNull();
    expect(loadSession('')).toBeNull();
  });

  it('refuses to delete a session with path-traversal characters', async () => {
    const { deleteSession, saveSession, loadSession } = await import('../../src/persistence/sessions.js');
    expect(() => deleteSession('../../config')).not.toThrow();
    // Save a sentinel, attempt bad delete targeting it via traversal, then verify sentinel survives.
    saveSession({ id: 'sentinel-test', title: 't', createdAt: 1, updatedAt: 1, cwd: '/x', messages: [] });
    deleteSession('../sentinel-test');
    expect(loadSession('sentinel-test')).not.toBeNull();
    deleteSession('sentinel-test');
  });

  it('refuses to rename a session with path-traversal characters', async () => {
    const { renameSession } = await import('../../src/persistence/sessions.js');
    expect(renameSession('../../config', 'hacked')).toBeNull();
  });

  it('refuses to save a session with path-traversal characters in id', async () => {
    const { saveSession, loadSession } = await import('../../src/persistence/sessions.js');
    saveSession({ id: '../../malicious', title: 't', createdAt: 1, updatedAt: 1, cwd: '/x', messages: [] });
    expect(loadSession('../../malicious')).toBeNull();
  });

  it('round-trips a session with extended SessionMessage fields', async () => {
    const { saveSession, loadSession } = await import('../../src/persistence/sessions.js');
    const s = {
      id: 'ext-test',
      title: 'tools',
      createdAt: 1,
      updatedAt: 2,
      cwd: '/x',
      messages: [
        { role: 'user' as const, content: 'read file', ts: 1 },
        {
          role: 'tool' as const,
          content: 'call read_file',
          ts: 2,
          toolCallId: 'call_abc',
          toolName: 'read_file',
        },
        {
          role: 'tool' as const,
          content: '{"lines":[]}',
          ts: 3,
          toolCallId: 'call_abc',
          toolName: 'read_file',
        },
      ],
    };
    saveSession(s);
    const got = loadSession('ext-test');
    expect(got).toEqual(s);
    expect(got?.messages[1]?.toolCallId).toBe('call_abc');
    expect(got?.messages[1]?.toolName).toBe('read_file');
  });
});
