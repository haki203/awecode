import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWorkflow, invokeSkill } from '../src/engine.js';

let tmpProject: string;
let tmpUser: string;

beforeEach(async () => {
  tmpProject = await mkdtemp(join(tmpdir(), 'awecode-engine-project-'));
  tmpUser = await mkdtemp(join(tmpdir(), 'awecode-engine-user-'));
});

afterEach(async () => {
  await Promise.all([
    rm(tmpProject, { recursive: true, force: true }),
    rm(tmpUser, { recursive: true, force: true }),
  ]);
});

describe('startWorkflow', () => {
  it('succeeds for built-in brainstorm skill', async () => {
    const result = await startWorkflow('brainstorm', tmpProject, tmpUser);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.skillName).toBe('brainstorm');
      expect(result.skillBody).toContain('Brainstorming');
    }
  });

  it('succeeds for all 4 built-in skills', async () => {
    for (const name of ['brainstorm', 'spec', 'grill', 'plan']) {
      const result = await startWorkflow(name, tmpProject, tmpUser);
      expect(result.ok).toBe(true);
    }
  });

  it('returns fail-loud error on missing skill', async () => {
    const result = await startWorkflow('nonexistent-skill', tmpProject, tmpUser);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/not found/i);
    }
  });
});

describe('invokeSkill', () => {
  it('returns skill body as output', async () => {
    const result = await invokeSkill('brainstorm', {}, tmpProject, tmpUser);
    expect(result.skillName).toBe('brainstorm');
    expect(result.output).toContain('Brainstorming');
  });

  it('returns error message in output on missing skill', async () => {
    const result = await invokeSkill('nope', {}, tmpProject, tmpUser);
    expect(result.skillName).toBe('nope');
    expect(result.output).toMatch(/not found/i);
  });
});
