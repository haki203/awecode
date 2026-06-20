import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSkill, listAvailableSkills } from '../src/loader.js';

let tmpProject: string;
let tmpUser: string;

beforeEach(async () => {
  tmpProject = await mkdtemp(join(tmpdir(), 'awecode-wf-project-'));
  tmpUser = await mkdtemp(join(tmpdir(), 'awecode-wf-user-'));
});

afterEach(async () => {
  await Promise.all([
    rm(tmpProject, { recursive: true, force: true }),
    rm(tmpUser, { recursive: true, force: true }),
  ]);
});

async function makeSkill(dir: string, name: string, body: string): Promise<void> {
  await mkdir(join(dir, name), { recursive: true });
  await writeFile(
    join(dir, name, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${body}\n---\n\n${body}`,
    'utf-8',
  );
}

describe('loadSkill', () => {
  it('returns null when skill not found anywhere', async () => {
    const skill = await loadSkill('nonexistent', tmpProject, tmpUser);
    expect(skill).toBeNull();
  });

  it('loads built-in skill when no project/user override', async () => {
    const skill = await loadSkill('brainstorm', tmpProject, tmpUser);
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe('brainstorm');
    expect(skill!.sourcePath).toBe('built-in');
  });

  it('project skill overrides built-in', async () => {
    await makeSkill(join(tmpProject, '.awecode', 'skills'), 'brainstorm', 'Project version');
    const skill = await loadSkill('brainstorm', tmpProject, tmpUser);
    expect(skill).not.toBeNull();
    expect(skill!.sourcePath).toBe('project');
    expect(skill!.body).toContain('Project version');
  });

  it('user skill overrides built-in when no project skill', async () => {
    await makeSkill(tmpUser, 'brainstorm', 'User version');
    const skill = await loadSkill('brainstorm', tmpProject, tmpUser);
    expect(skill).not.toBeNull();
    expect(skill!.sourcePath).toBe('user');
    expect(skill!.body).toContain('User version');
  });

  it('project skill overrides user skill', async () => {
    await makeSkill(join(tmpProject, '.awecode', 'skills'), 'brainstorm', 'Project');
    await makeSkill(tmpUser, 'brainstorm', 'User');
    const skill = await loadSkill('brainstorm', tmpProject, tmpUser);
    expect(skill!.sourcePath).toBe('project');
  });
});

describe('listAvailableSkills', () => {
  it('includes built-in skills', async () => {
    const names = await listAvailableSkills(tmpProject, tmpUser);
    expect(names).toContain('brainstorm');
    expect(names).toContain('spec');
    expect(names).toContain('grill');
    expect(names).toContain('plan');
  });

  it('includes user and project skills (deduped)', async () => {
    await makeSkill(tmpUser, 'custom-user-skill', 'user');
    await makeSkill(join(tmpProject, '.awecode', 'skills'), 'custom-project-skill', 'project');

    const names = await listAvailableSkills(tmpProject, tmpUser);
    expect(names).toContain('custom-user-skill');
    expect(names).toContain('custom-project-skill');
    expect(names).toContain('brainstorm');
  });
});
