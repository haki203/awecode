import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { createWorktree } from '../src/worktree.js';
import { runCommand, type RunCommandResult } from '../src/shell.js';

let tmpProject: string;

beforeEach(async () => {
  tmpProject = await mkdtemp(join(tmpdir(), 'awecode-shell-test-'));
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

describe('runCommand', () => {
  it('runs echo in worktree cwd', async () => {
    const wt = await createWorktree(tmpProject);
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'Write-Output "hello"' : 'echo hello';

    const result = await runCommand(wt, cmd);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello');
  });

  it('captures stderr separately', async () => {
    const wt = await createWorktree(tmpProject);
    const isWin = process.platform === 'win32';
    // NOTE: Brief used 'Write-Error "boom"' but PowerShell's Write-Error does
    // NOT cause a non-zero exit code by default inside
    // `powershell.exe -NonInteractive -Command` ($LASTEXITCODE stays 0).
    // Using `throw "boom"` instead produces a non-zero exit AND writes the
    // error message to stderr, satisfying both assertions of this test.
    const cmd = isWin
      ? 'throw "boom"'
      : 'sh -c \'echo "boom" >&2\'';

    const result = await runCommand(wt, cmd);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('boom');
  });

  it('respects timeoutMs', async () => {
    const wt = await createWorktree(tmpProject);
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'Start-Sleep -Seconds 10' : 'sleep 10';

    const result = await runCommand(wt, cmd, 500);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toLowerCase()).toMatch(/timed? ?out|timeout/);
  }, 10_000);
});
