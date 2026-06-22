import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('migrateSessionsDir (fresh-start)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'awecode-mig-'));
    process.env.AWECODE_SESSIONS_DIR = dir;
    // sessions.ts captures AWECODE_SESSIONS_DIR into a module-level constant
    // at import time. Reset the module registry so each test re-imports with
    // the new dir. Otherwise every test silently shares the first test's dir.
    vi.resetModules();
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.AWECODE_SESSIONS_DIR;
  });

  it('deletes sessions whose tool messages lack toolCallId fields', async () => {
    const { saveSession } = await import('../../src/persistence/sessions.js');
    const { migrateSessionsDir } = await import('../../../gui/src/main/migration.js');

    // Legacy session: tool message without toolCallId
    saveSession({
      id: 'legacy',
      title: 'old',
      createdAt: 1,
      updatedAt: 1,
      cwd: '/x',
      messages: [
        { role: 'user', content: 'hi', ts: 1 },
        { role: 'tool', content: 'call x', ts: 2 }, // no toolCallId
      ],
    });
    // Modern session: has toolCallId
    saveSession({
      id: 'modern',
      title: 'new',
      createdAt: 1,
      updatedAt: 1,
      cwd: '/x',
      messages: [
        { role: 'user', content: 'hi', ts: 1 },
        { role: 'tool', content: 'call x', ts: 2, toolCallId: 'c1', toolName: 'x' },
      ],
    });

    migrateSessionsDir();

    expect(existsSync(join(dir, 'legacy.json'))).toBe(false);
    expect(existsSync(join(dir, 'modern.json'))).toBe(true);
  });

  it('keeps sessions that have no tool messages at all', async () => {
    const { saveSession } = await import('../../src/persistence/sessions.js');
    const { migrateSessionsDir } = await import('../../../gui/src/main/migration.js');

    saveSession({
      id: 'plain',
      title: 'x',
      createdAt: 1,
      updatedAt: 1,
      cwd: '/x',
      messages: [{ role: 'user', content: 'hi', ts: 1 }],
    });

    migrateSessionsDir();

    expect(existsSync(join(dir, 'plain.json'))).toBe(true);
  });

  it('is idempotent (running twice is a no-op)', async () => {
    const { saveSession } = await import('../../src/persistence/sessions.js');
    const { migrateSessionsDir } = await import('../../../gui/src/main/migration.js');

    saveSession({
      id: 'modern',
      title: 'new',
      createdAt: 1,
      updatedAt: 1,
      cwd: '/x',
      messages: [{ role: 'user', content: 'hi', ts: 1 }],
    });

    migrateSessionsDir();
    migrateSessionsDir();

    expect(readdirSync(dir)).toHaveLength(1);
  });
});
