import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { createWorktree } from '../src/worktree.js';

let tmpProject: string;

beforeEach(async () => {
  tmpProject = await mkdtemp(join(tmpdir(), 'awecode-wt-test-'));
  // Initialize as git repo with initial commit (worktrees need a commit)
  const git = simpleGit(tmpProject);
  await git.init();
  await git.addConfig('user.email', 'test@test.com');
  await git.addConfig('user.name', 'Test');
  await writeFile(join(tmpProject, 'README.md'), '# test\n', 'utf-8');
  await git.add(['.']);
  await git.commit('initial');
});

afterEach(async () => {
  await rm(tmpProject, { recursive: true, force: true });
});

describe('createWorktree', () => {
  it('creates worktree at .awecode/worktrees/<uuid>', async () => {
    const wt = await createWorktree(tmpProject);

    expect(wt.uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(wt.branch).toBe(`agent/${wt.uuid}`);
    expect(wt.path).toContain('.awecode');
    expect(wt.path).toContain('worktrees');
    expect(wt.path).toContain(wt.uuid);

    // Worktree dir exists
    const s = await stat(wt.path);
    expect(s.isDirectory()).toBe(true);
  });

  it('returns createdAt timestamp', async () => {
    const before = Date.now();
    const wt = await createWorktree(tmpProject);
    const after = Date.now();
    expect(wt.createdAt).toBeGreaterThanOrEqual(before);
    expect(wt.createdAt).toBeLessThanOrEqual(after);
  });

  it('branch is listed in git branches', async () => {
    const wt = await createWorktree(tmpProject);
    const git = simpleGit(tmpProject);
    const branches = await git.branchLocal();
    expect(branches.all).toContain(wt.branch);
  });
});
