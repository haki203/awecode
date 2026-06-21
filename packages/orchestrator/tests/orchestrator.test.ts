import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { Orchestrator } from '../src/orchestrator.js';
import { ApprovalQueue, ContextManager } from '@awecode/agent';
import * as readline from 'node:readline/promises';

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'awecode-orch-'));
  const git = simpleGit(tmpRoot);
  await git.init();
  await git.addConfig('user.email', 'test@test.com');
  await git.addConfig('user.name', 'Test');
  await writeFile(join(tmpRoot, '.gitattributes'), '* text=auto eol=lf\n');
  await writeFile(join(tmpRoot, 'foo.ts'), 'old\n', 'utf-8');
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

describe('Orchestrator.handleDiffDetected - Phase 1', () => {
  it('parses single block + approve → proceeds to pipeline', async () => {
    const mockFn = vi.fn();
    const rl = { question: vi.fn().mockResolvedValue('y\n'), close: vi.fn() };
    (readline.default as any).createInterface = mockFn.mockReturnValue(rl);
    (readline as any).createInterface = mockFn.mockReturnValue(rl);

    const phases: string[] = [];
    const ctx = new ContextManager();
    const orch = new Orchestrator({
      projectRoot: tmpRoot,
      context: ctx,
      approvalQueue: new ApprovalQueue(),
      taskUuid: 'task-test-1',
      chatMessages: [],
      onPhaseChange: (p) => phases.push(p),
    });

    const diffText = `file_path: foo.ts
<<<< SEARCH
old
====
new
>>>> REPLACE`;

    const result = await orch.handleDiffDetected(diffText);
    expect(result.success).toBe(true);
    expect(phases).toContain('parsing');
    expect(phases).toContain('approving');
    expect(phases).toContain('success');
  });

  it('quits immediately when user types q in approval', async () => {
    const mockFn = vi.fn();
    const rl = { question: vi.fn().mockResolvedValue('q\n'), close: vi.fn() };
    (readline.default as any).createInterface = mockFn.mockReturnValue(rl);
    (readline as any).createInterface = mockFn.mockReturnValue(rl);

    const phases: string[] = [];
    const ctx = new ContextManager();
    const orch = new Orchestrator({
      projectRoot: tmpRoot,
      context: ctx,
      approvalQueue: new ApprovalQueue(),
      taskUuid: 'task-test-2',
      chatMessages: [],
      onPhaseChange: (p) => phases.push(p),
    });

    const result = await orch.handleDiffDetected(
      `file_path: foo.ts\n<<<< SEARCH\nold\n====\nnew\n>>>> REPLACE`,
    );

    expect(result.success).toBe(false);
    expect(result.phase).toBe('aborted');
    expect(phases).not.toContain('creating_worktree');
  });
});

describe('Orchestrator.handleDiffDetected - Phase 2 (pipeline)', () => {
  it('creates worktree, applies diff, self-heals (mock runCmd), merges, commits', async () => {
    const mockFn = vi.fn();
    const rl = { question: vi.fn().mockResolvedValue('y\n'), close: vi.fn() };
    (readline.default as any).createInterface = mockFn.mockReturnValue(rl);
    (readline as any).createInterface = mockFn.mockReturnValue(rl);

    const phases: string[] = [];
    const ctx = new ContextManager();
    const events: any[] = [];

    const orch = new Orchestrator({
      projectRoot: tmpRoot,
      context: ctx,
      approvalQueue: new ApprovalQueue(),
      taskUuid: 'task-pipe-1',
      chatMessages: [],
      selfHealConfig: {
        maxSteps: 3,
        maxConsecutiveSameError: 2,
        totalTimeout: 300_000,
        commandTimeout: 60_000,
        diffFailStreak: 3,
      },
      onPhaseChange: (p) => phases.push(p),
      onSelfHealEvent: (e) => events.push(e),
      runCommandOverride: async () => ({ exitCode: 0, stdout: 'pass', stderr: '' }),
    });

    const result = await orch.handleDiffDetected(
      `file_path: foo.ts\n<<<< SEARCH\nold\n====\nnew\n>>>> REPLACE`,
    );

    expect(result.success).toBe(true);
    expect(phases).toContain('creating_worktree');
    expect(phases).toContain('applying_diff');
    expect(phases).toContain('self_healing');
    expect(phases).toContain('merging');
    expect(phases).toContain('committing');
    expect(phases).toContain('cleaning_up');
    expect(events.some((e) => e.type === 'success')).toBe(true);

    const updated = await readFile(join(tmpRoot, 'foo.ts'), 'utf-8');
    expect(updated).toBe('new\n');

    const git = simpleGit(tmpRoot);
    const log = await git.log();
    expect(log.latest?.message).toContain('awecode: task-pipe-1');
  });

  it('injects feedback message on apply failure (Q7/A)', async () => {
    const mockFn = vi.fn();
    const rl = { question: vi.fn().mockResolvedValue('y\n'), close: vi.fn() };
    (readline.default as any).createInterface = mockFn.mockReturnValue(rl);
    (readline as any).createInterface = mockFn.mockReturnValue(rl);

    const chatMessages: any[] = [];
    const ctx = new ContextManager();

    const orch = new Orchestrator({
      projectRoot: tmpRoot,
      context: ctx,
      approvalQueue: new ApprovalQueue(),
      taskUuid: 'task-fail-1',
      chatMessages,
      selfHealConfig: {
        maxSteps: 3,
        maxConsecutiveSameError: 2,
        totalTimeout: 300_000,
        commandTimeout: 60_000,
        diffFailStreak: 2,
      },
      applyDiffOverride: async () => ({ ok: false, error: 'no_match' }),
      runCommandOverride: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    });

    const result = await orch.handleDiffDetected(
      `file_path: foo.ts\n<<<< SEARCH\nold\n====\nnew\n>>>> REPLACE`,
    );

    expect(result.success).toBe(false);
    expect(result.phase).toBe('failed');
    expect(
      chatMessages.some(
        (m) => typeof m.content === 'string' && m.content.includes('apply failed'),
      ),
    ).toBe(true);
  });
});
