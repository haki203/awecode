import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import {
  createWorktree,
  listWorktrees,
  removeWorktree,
  cleanStaleWorktrees,
} from '../src/worktree.js';

let tmpProject: string;

beforeEach(async () => {
  tmpProject = await mkdtemp(join(tmpdir(), 'awecode-wt-list-test-'));
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

describe('listWorktrees', () => {
  it('returns empty array when no worktrees', async () => {
    const list = await listWorktrees(tmpProject);
    expect(list).toEqual([]);
  });

  it('lists created worktrees', async () => {
    const wt1 = await createWorktree(tmpProject);
    const wt2 = await createWorktree(tmpProject);

    const list = await listWorktrees(tmpProject);
    const uuids = list.map((w) => w.uuid);
    expect(uuids).toContain(wt1.uuid);
    expect(uuids).toContain(wt2.uuid);
  });
});

describe('removeWorktree', () => {
  it('removes worktree and its branch', async () => {
    const wt = await createWorktree(tmpProject);

    await removeWorktree(tmpProject, wt.uuid);

    const list = await listWorktrees(tmpProject);
    expect(list.map((w) => w.uuid)).not.toContain(wt.uuid);

    const git = simpleGit(tmpProject);
    const branches = await git.branchLocal();
    expect(branches.all).not.toContain(wt.branch);
  });
});

describe('cleanStaleWorktrees', () => {
  it('removes worktrees older than maxAgeMs', async () => {
    // Create a worktree, manually backdate its createdAt via listWorktrees trick
    // For test purposes, use maxAgeMs=0 (immediately stale)
    const wt = await createWorktree(tmpProject);

    const removed = await cleanStaleWorktrees(tmpProject, 0);
    expect(removed).toContain(wt.uuid);

    const list = await listWorktrees(tmpProject);
    expect(list.map((w) => w.uuid)).not.toContain(wt.uuid);
  });

  it('returns empty array when nothing stale', async () => {
    await createWorktree(tmpProject);
    const removed = await cleanStaleWorktrees(tmpProject, 60 * 60 * 1000);
    expect(removed).toEqual([]);
  });
});
