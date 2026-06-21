import { describe, it, expect, vi } from 'vitest';
import { runSelfHealLoop, DEFAULT_SELF_HEAL_CONFIG } from '../src/selfheal.js';
import type { Worktree, SelfHealEvent } from '../src/types.js';

const mockWt: Worktree = {
  uuid: 'test-uuid',
  path: '/tmp/fake-worktree',
  branch: 'agent/test-uuid',
  createdAt: Date.now(),
};

function makeCallbacks(opts: {
  applyResults?: Array<{ ok: true } | { ok: false; error: string }>;
  newDiffs?: string[];
  events: SelfHealEvent[];
}) {
  let applyIdx = 0;
  let diffIdx = 0;
  return {
    onEvent: (e: SelfHealEvent) => opts.events.push(e),
    onCommandFailed: vi.fn(async () => {
      const diff = opts.newDiffs?.[diffIdx++] ?? 'fallback diff';
      return diff;
    }),
    onDiffApplyFailed: vi.fn(async () => {
      const diff = opts.newDiffs?.[diffIdx++] ?? 'fallback diff after apply fail';
      return diff;
    }),
    applyDiff: vi.fn(async () => {
      const r = opts.applyResults?.[applyIdx++] ?? { ok: true as const };
      return r;
    }),
  };
}

describe('runSelfHealLoop', () => {
  it('succeeds on step 1 when command passes', async () => {
    // Mock runCommand via module mock
    const events: SelfHealEvent[] = [];
    const cbs = makeCallbacks({ events });

    // Override runCommand at module level is tricky; we'll re-import
    // For unit test, we'll refactor selfheal to accept runCommand as dep
    const result = await runSelfHealLoop(
      mockWt,
      'initial diff',
      'test command',
      { ...DEFAULT_SELF_HEAL_CONFIG, maxSteps: 3 },
      cbs,
      async () => ({ exitCode: 0, stdout: 'pass', stderr: '' }), // always succeed
    );

    expect(result.success).toBe(true);
    expect(result.stepsUsed).toBe(1);
    expect(events.some((e) => e.type === 'success')).toBe(true);
  });

  it('retries and succeeds on step 2', async () => {
    const events: SelfHealEvent[] = [];
    const cbs = makeCallbacks({
      events,
      newDiffs: ['fixed diff'],
    });

    let callCount = 0;
    const result = await runSelfHealLoop(
      mockWt,
      'initial diff',
      'test command',
      { ...DEFAULT_SELF_HEAL_CONFIG, maxSteps: 3 },
      cbs,
      async () => {
        callCount++;
        if (callCount === 1) {
          return { exitCode: 1, stdout: '', stderr: 'TypeError: x is undefined' };
        }
        return { exitCode: 0, stdout: 'pass', stderr: '' };
      },
    );

    expect(result.success).toBe(true);
    expect(result.stepsUsed).toBe(2);
    expect(cbs.onCommandFailed).toHaveBeenCalledTimes(1);
  });

  it('caps at maxSteps', async () => {
    const events: SelfHealEvent[] = [];
    const cbs = makeCallbacks({ events });

    const result = await runSelfHealLoop(
      mockWt,
      'diff',
      'cmd',
      { ...DEFAULT_SELF_HEAL_CONFIG, maxSteps: 3 },
      cbs,
      async () => ({ exitCode: 1, stdout: '', stderr: 'different error each time' + Math.random() }),
    );

    expect(result.success).toBe(false);
    expect(result.stepsUsed).toBe(3);
    expect(events.some((e) => e.type === 'step_cap_reached')).toBe(true);
  });

  it('triggers user takeover on maxConsecutiveSameError', async () => {
    const events: SelfHealEvent[] = [];
    const cbs = makeCallbacks({ events });

    const sameError = 'SameError';
    const result = await runSelfHealLoop(
      mockWt,
      'diff',
      'cmd',
      {
        ...DEFAULT_SELF_HEAL_CONFIG,
        maxSteps: 5,
        maxConsecutiveSameError: 2,
      },
      cbs,
      async () => ({ exitCode: 1, stdout: '', stderr: sameError }),
    );

    expect(result.success).toBe(false);
    expect(events.some((e) => e.type === 'user_takeover')).toBe(true);
    expect(events.some((e) => e.type === 'consecutive_same_error' && e.count === 2)).toBe(true);
  });

  it('respects totalTimeout', async () => {
    const events: SelfHealEvent[] = [];
    const cbs = makeCallbacks({ events });

    const result = await runSelfHealLoop(
      mockWt,
      'diff',
      'cmd',
      {
        ...DEFAULT_SELF_HEAL_CONFIG,
        maxSteps: 10,
        totalTimeout: 50, // 50ms — will trigger almost immediately
      },
      cbs,
      async () => {
        await new Promise((r) => setTimeout(r, 30));
        return { exitCode: 1, stdout: '', stderr: 'slow error' };
      },
    );

    expect(result.success).toBe(false);
    // Will hit either step_cap or timeout; check it stopped early
    expect(result.stepsUsed).toBeLessThan(10);
  }, 10_000);

  it('returns applyDiff error after diffFailStreak cap reached', async () => {
    const events: SelfHealEvent[] = [];
    const cbs = makeCallbacks({
      events,
      applyResults: [
        { ok: false, error: 'no_match' },
        { ok: false, error: 'no_match' },
        { ok: false, error: 'no_match' },
      ],
    });

    const result = await runSelfHealLoop(
      mockWt,
      'bad diff',
      'cmd',
      DEFAULT_SELF_HEAL_CONFIG,
      cbs,
      async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    );

    expect(result.success).toBe(false);
    expect(result.finalStderr).toContain('streak cap');
    expect(result.finalStderr).toContain('no_match');
    const streakEvents = events.filter((e) => e.type === 'diff_fail_streak_reached');
    expect(streakEvents).toHaveLength(3);
    expect(cbs.onDiffApplyFailed).toHaveBeenCalledTimes(2);
  });

  it('retries diff on apply failure until success', async () => {
    const events: SelfHealEvent[] = [];
    const cbs = makeCallbacks({
      events,
      applyResults: [
        { ok: false, error: 'no_match' },
        { ok: false, error: 'no_match' },
        { ok: true },
      ],
    });

    const result = await runSelfHealLoop(
      mockWt,
      'bad diff',
      'cmd',
      DEFAULT_SELF_HEAL_CONFIG,
      cbs,
      async () => ({ exitCode: 0, stdout: 'pass', stderr: '' }),
    );

    expect(result.success).toBe(true);
    expect(result.stepsUsed).toBe(3);
    expect(cbs.onDiffApplyFailed).toHaveBeenCalledTimes(2);
    const streakEvents = events.filter((e) => e.type === 'diff_fail_streak_reached');
    expect(streakEvents).toHaveLength(2);
  });

  it('aborts when abortSignal already aborted', async () => {
    const events: SelfHealEvent[] = [];
    const cbs = makeCallbacks({ events });
    const controller = new AbortController();
    controller.abort();

    const result = await runSelfHealLoop(
      mockWt,
      'diff',
      'cmd',
      DEFAULT_SELF_HEAL_CONFIG,
      cbs,
      async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      controller.signal,
    );

    expect(result.success).toBe(false);
    expect(events.some((e) => e.type === 'user_takeover')).toBe(true);
    expect(result.stepsUsed).toBe(0);
  });
});
