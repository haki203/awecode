import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { createWorktree, runCommand, mergeToWorkingDir, listWorktrees, removeWorktree } from '../src/index.js';

let tmpProject: string;

beforeEach(async () => {
  tmpProject = await mkdtemp(join(tmpdir(), 'awecode-e2e-harness-'));
  const git = simpleGit(tmpProject);
  await git.init();
  await git.addConfig('user.email', 'test@test.com');
  await git.addConfig('user.name', 'Test');
  // Pin LF line endings so file-content assertions are stable regardless of
  // the host's global core.autocrlf setting (Windows CI often defaults to true).
  // Preventive: this test uses toContain (CRLF-tolerant) but mirror Tasks 7/8
  // to keep the suite consistent and avoid future flakiness.
  await writeFile(join(tmpProject, '.gitattributes'), '* text=auto eol=lf\n', 'utf-8');
  await writeFile(join(tmpProject, 'package.json'), '{"name":"test"}\n', 'utf-8');
  await git.add(['.']);
  await git.commit('initial');
});

afterEach(async () => {
  await rm(tmpProject, { recursive: true, force: true });
});

describe('harness lifecycle E2E', () => {
  it('create → modify → run cmd → merge → verify', async () => {
    // 1. Create worktree
    const wt = await createWorktree(tmpProject);
    expect(wt.uuid).toBeTruthy();

    // 2. Modify file in worktree
    await writeFile(join(wt.path, 'package.json'), '{"name":"updated"}\n', 'utf-8');
    const wtGit = simpleGit(wt.path);
    await wtGit.add(['.']);
    await wtGit.commit('update package name');

    // 3. Run a command in worktree (list files)
    const isWin = process.platform === 'win32';
    const listCmd = isWin ? 'Get-ChildItem -Name' : 'ls';
    const result = await runCommand(wt, listCmd);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('package.json');

    // 4. Merge back
    const mergeRes = await mergeToWorkingDir(tmpProject, wt);
    expect(mergeRes.ok).toBe(true);

    // 5. Verify in main dir
    const final = await readFile(join(tmpProject, 'package.json'), 'utf-8');
    expect(final).toContain('"updated"');

    // 6. Cleanup
    await removeWorktree(tmpProject, wt.uuid);
    const list = await listWorktrees(tmpProject);
    expect(list).toEqual([]);
  });
});
