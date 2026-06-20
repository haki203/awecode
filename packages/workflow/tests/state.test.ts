import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSession, saveSession, getSessionPath, createNewSession } from '../src/state.js';
import type { WorkflowSession } from '../src/types.js';

let tmpProject: string;

beforeEach(async () => {
  tmpProject = await mkdtemp(join(tmpdir(), 'awecode-wf-state-'));
});

afterEach(async () => {
  await rm(tmpProject, { recursive: true, force: true });
});

describe('getSessionPath', () => {
  it('returns .awecode/session.json', () => {
    const p = getSessionPath(tmpProject);
    expect(p.replace(/\\/g, '/')).toMatch(/\.awecode\/session\.json$/);
  });
});

describe('createNewSession', () => {
  it('creates session with taskId and empty history', () => {
    const s = createNewSession();
    expect(s.taskId).toMatch(/^[0-9a-f-]{36}$/);
    expect(s.currentWorkflow).toBeNull();
    expect(s.currentPhase).toBeNull();
    expect(s.history).toEqual([]);
  });
});

describe('loadSession', () => {
  it('returns null when no session file', async () => {
    const s = await loadSession(tmpProject);
    expect(s).toBeNull();
  });

  it('loads saved session', async () => {
    const session: WorkflowSession = {
      taskId: 'abc-123',
      currentWorkflow: 'brainstorm',
      currentPhase: 'round-2',
      history: [
        { workflow: 'brainstorm', startedAt: '2026-06-19T10:00:00Z' },
      ],
    };
    await saveSession(tmpProject, session);

    const loaded = await loadSession(tmpProject);
    expect(loaded).not.toBeNull();
    expect(loaded!.taskId).toBe('abc-123');
    expect(loaded!.currentWorkflow).toBe('brainstorm');
    expect(loaded!.history).toHaveLength(1);
  });

  it('throws on malformed JSON', async () => {
    const { writeFile, mkdir } = await import('node:fs/promises');
    await mkdir(join(tmpProject, '.awecode'), { recursive: true });
    await writeFile(getSessionPath(tmpProject), '{invalid json', 'utf-8');
    await expect(loadSession(tmpProject)).rejects.toThrow();
  });
});

describe('saveSession', () => {
  it('creates .awecode dir if missing', async () => {
    const session = createNewSession();
    await saveSession(tmpProject, session);
    const loaded = await loadSession(tmpProject);
    expect(loaded).not.toBeNull();
  });

  it('overwrites existing session', async () => {
    const s1 = createNewSession();
    await saveSession(tmpProject, s1);

    const s2 = { ...s1, currentWorkflow: 'spec' };
    await saveSession(tmpProject, s2);

    const loaded = await loadSession(tmpProject);
    expect(loaded!.currentWorkflow).toBe('spec');
  });
});
