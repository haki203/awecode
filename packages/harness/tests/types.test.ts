import { describe, it, expect } from 'vitest';
import type {
  Worktree,
  SandboxMode,
  SandboxConfig,
  SelfHealConfig,
} from '../src/types.js';

describe('harness types', () => {
  it('Worktree has uuid, path, branch, createdAt', () => {
    const wt: Worktree = {
      uuid: 'abc-123',
      path: '/tmp/.awecode/worktrees/abc-123',
      branch: 'agent/abc-123',
      createdAt: Date.now(),
    };
    expect(wt.uuid).toBe('abc-123');
    expect(wt.branch).toBe('agent/abc-123');
  });

  it('SandboxMode is git-only or docker', () => {
    const m: SandboxMode = 'git-only';
    expect(m).toBe('git-only');
  });

  it('SandboxConfig has mode, isolateNetwork, timeouts', () => {
    const cfg: SandboxConfig = {
      mode: 'git-only',
      isolateNetwork: true,
      commandTimeout: 60_000,
      totalTimeout: 300_000,
    };
    expect(cfg.commandTimeout).toBe(60_000);
  });

  it('SelfHealConfig has 5 guards', () => {
    const cfg: SelfHealConfig = {
      maxSteps: 3,
      maxConsecutiveSameError: 2,
      totalTimeout: 300_000,
      commandTimeout: 60_000,
      diffFailStreak: 3,
    };
    expect(cfg.maxSteps).toBe(3);
    expect(cfg.maxConsecutiveSameError).toBe(2);
  });
});
