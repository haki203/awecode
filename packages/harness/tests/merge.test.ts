import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { createWorktree } from '../src/worktree.js';
import { mergeToWorkingDir } from '../src/merge.js';

let tmpProject: string;

beforeEach(async () => {
  tmpProject = await mkdtemp(join(tmpdir(), 'awecode-merge-test-'));
  const git = simpleGit(tmpProject);
  await git.init();
  await git.addConfig('user.email', 'test@test.com');
  await git.addConfig('user.name', 'Test');
  // Pin LF line endings so file-content assertions are stable regardless of
  // the host's global core.autocrlf setting (Windows CI often defaults to true).
  await writeFile(join(tmpProject, '.gitattributes'), '* text=auto eol=lf\n', 'utf-8');
  await writeFile(join(tmpProject, 'foo.txt'), 'original\n', 'utf-8');
  await git.add(['.']);
  await git.commit('initial');
});

afterEach(async () => {
  await rm(tmpProject, { recursive: true, force: true });
});

describe('mergeToWorkingDir', () => {
  it('merges worktree branch into current branch', async () => {
    const wt = await createWorktree(tmpProject);

    // Make a commit in the worktree
    await writeFile(join(wt.path, 'foo.txt'), 'updated\n', 'utf-8');
    const wtGit = simpleGit(wt.path);
    await wtGit.add(['.']);
    await wtGit.commit('update foo');

    // Merge back
    const result = await mergeToWorkingDir(tmpProject, wt, { mode: 'git-merge' });
    expect(result.ok).toBe(true);

    // Verify working dir has the change
    const final = await readFile(join(tmpProject, 'foo.txt'), 'utf-8');
    expect(final).toBe('updated\n');
  });

  it('detects merge conflict', async () => {
    const wt = await createWorktree(tmpProject);

    // Modify in worktree
    await writeFile(join(wt.path, 'foo.txt'), 'worktree-change\n', 'utf-8');
    const wtGit = simpleGit(wt.path);
    await wtGit.add(['.']);
    await wtGit.commit('worktree change');

    // Modify in main project (different content)
    await writeFile(join(tmpProject, 'foo.txt'), 'main-change\n', 'utf-8');
    const mainGit = simpleGit(tmpProject);
    await mainGit.add(['.']);
    await mainGit.commit('main change');

    // Merge should detect conflict
    const result = await mergeToWorkingDir(tmpProject, wt, { mode: 'git-merge' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/conflict|merge/i);
    }
  });
});
