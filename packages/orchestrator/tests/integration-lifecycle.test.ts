import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import * as readline from 'node:readline/promises';
import type { Interface as ReadlineInterface } from 'node:readline/promises';
import { Orchestrator } from '../src/index.js';
import { ApprovalQueue, ContextManager } from '@awecode/agent';

type MockRl = Pick<ReadlineInterface, 'question' | 'close'>;

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'awecode-orch-e2e-'));
  const git = simpleGit(tmpRoot);
  await git.init();
  await git.addConfig('user.email', 'test@test.com');
  await git.addConfig('user.name', 'Test');
  await writeFile(join(tmpRoot, '.gitattributes'), '* text=auto eol=lf\n');
  await writeFile(join(tmpRoot, 'package.json'), '{"name":"test","scripts":{"test":"vitest"}}\n');
  await writeFile(join(tmpRoot, 'foo.ts'), 'export const x = 1;\n');
  await git.add('.');
  await git.commit('initial');
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

vi.mock('node:readline/promises', () => ({
  default: { createInterface: vi.fn() },
  createInterface: vi.fn(),
}));

describe('Orchestrator E2E', () => {
  it('full cycle: parse → approve → worktree → apply → self-heal → merge → commit → cleanup', async () => {
    const mockFn = vi.fn();
    const rl: MockRl = { question: vi.fn().mockResolvedValue('y\n'), close: vi.fn() };
    (readline.default as unknown as { createInterface: unknown }).createInterface =
      mockFn.mockReturnValue(rl);
    (readline as unknown as { createInterface: unknown }).createInterface =
      mockFn.mockReturnValue(rl);

    const phases: string[] = [];
    const chatMessages: { role: string; content: string }[] = [];

    const orch = new Orchestrator({
      projectRoot: tmpRoot,
      context: new ContextManager(),
      approvalQueue: new ApprovalQueue(),
      taskUuid: 'e2e-task-1',
      chatMessages,
      onPhaseChange: (p) => phases.push(p),
      runCommandOverride: async () => ({ exitCode: 0, stdout: 'pass', stderr: '' }),
    });

    const result = await orch.handleDiffDetected(
      `file_path: foo.ts
<<<< SEARCH
export const x = 1;
====
export const x = 2;
>>>> REPLACE`,
    );

    expect(result.success).toBe(true);
    expect(result.mergedFiles).toEqual(['foo.ts']);

    // Verify working dir updated
    const final = await readFile(join(tmpRoot, 'foo.ts'), 'utf-8');
    expect(final).toBe('export const x = 2;\n');

    // Verify commit
    const git = simpleGit(tmpRoot);
    const log = await git.log();
    expect(log.latest?.message).toContain('awecode: e2e-task-1');

    // Verify worktree cleaned up
    const branches = await git.branchLocal();
    expect(branches.all.filter((b) => b.startsWith('agent/'))).toHaveLength(0);

    // Verify phase sequence
    expect(phases[0]).toBe('parsing');
    expect(phases[phases.length - 1]).toBe('success');
  });
});
