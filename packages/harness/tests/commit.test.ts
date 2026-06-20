import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { commitDiff } from '../src/commit.js';
import type { ParsedDiff } from '@awecode/diff';

let tmpProject: string;

beforeEach(async () => {
  tmpProject = await mkdtemp(join(tmpdir(), 'awecode-commit-test-'));
  const git = simpleGit(tmpProject);
  await git.init();
  await git.addConfig('user.email', 'test@test.com');
  await git.addConfig('user.name', 'Test');
  // Pin LF line endings so behavior is stable regardless of the host's global
  // core.autocrlf setting (Windows CI often defaults to true). Preventive
  // measure mirroring Task 7's confirmed fix in merge.test.ts — this test has
  // no strict file-content assertions today, but keeping the convention avoids
  // surprises if such assertions are added later.
  await writeFile(join(tmpProject, '.gitattributes'), '* text=auto eol=lf\n', 'utf-8');
  await writeFile(join(tmpProject, 'foo.txt'), 'initial\n', 'utf-8');
  await git.add(['.']);
  await git.commit('initial');
});

afterEach(async () => {
  await rm(tmpProject, { recursive: true, force: true });
});

const mockDiff: ParsedDiff = {
  filePath: 'foo.txt',
  blocks: [{ search: 'initial\n', replace: 'updated\n' }],
};

describe('commitDiff', () => {
  it('commits file with per-block strategy', async () => {
    // Modify file first (simulating apply)
    await writeFile(join(tmpProject, 'foo.txt'), 'updated\n', 'utf-8');

    const result = await commitDiff(tmpProject, mockDiff, {
      strategy: 'per-block',
      taskUuid: 'task-123',
    });

    expect(result.skipped).toBeFalsy();
    expect(result.sha).toBeTruthy();

    // Verify commit message
    const git = simpleGit(tmpProject);
    const log = await git.log();
    expect(log.latest?.message).toContain('awecode: task-123');
    expect(log.latest?.message).toContain('foo.txt');
  });

  it('commits with per-task strategy (no filename in message)', async () => {
    await writeFile(join(tmpProject, 'foo.txt'), 'updated\n', 'utf-8');

    const result = await commitDiff(tmpProject, mockDiff, {
      strategy: 'per-task',
      taskUuid: 'task-456',
    });

    expect(result.sha).toBeTruthy();

    const git = simpleGit(tmpProject);
    const log = await git.log();
    expect(log.latest?.message).toBe('awecode: task-456');
  });

  it('skips commit on manual strategy', async () => {
    await writeFile(join(tmpProject, 'foo.txt'), 'updated\n', 'utf-8');

    const result = await commitDiff(tmpProject, mockDiff, {
      strategy: 'manual',
      taskUuid: 'task-789',
    });

    expect(result.skipped).toBe(true);
    expect(result.sha).toBeUndefined();
  });
});
