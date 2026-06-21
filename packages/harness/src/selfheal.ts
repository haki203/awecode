// Copyright 2026 Awecode Contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import type { SelfHealConfig, SelfHealEvent, Worktree } from './types.js';
import type { RunCommandResult } from './shell.js';

export const DEFAULT_SELF_HEAL_CONFIG: SelfHealConfig = {
  maxSteps: 3,
  maxConsecutiveSameError: 2,
  totalTimeout: 300_000,
  commandTimeout: 60_000,
  diffFailStreak: 3,
};

export interface SelfHealCallbacks {
  onEvent: (e: SelfHealEvent) => void;
  onCommandFailed: (stderr: string, lastDiff: string) => Promise<string>;
  onDiffApplyFailed: (error: string, lastDiff: string) => Promise<string>;
  applyDiff: (
    diff: string,
    worktreePath: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}

export interface RunCommandFn {
  (worktree: Worktree, command: string, timeoutMs?: number): Promise<RunCommandResult>;
}

export async function runSelfHealLoop(
  worktree: Worktree,
  initialDiff: string,
  testCommand: string,
  config: SelfHealConfig,
  callbacks: SelfHealCallbacks,
  runCmd: RunCommandFn,
  abortSignal?: AbortSignal,
): Promise<{ success: boolean; finalStderr?: string; stepsUsed: number }> {
  let currentDiff = initialDiff;
  let lastStderr = '';
  let consecutiveSame = 0;
  let diffFailStreak = 0;
  const startTime = Date.now();

  for (let step = 1; step <= config.maxSteps; step++) {
    callbacks.onEvent({ type: 'step_start', step });

    if (Date.now() - startTime > config.totalTimeout) {
      callbacks.onEvent({ type: 'step_cap_reached' });
      return { success: false, finalStderr: lastStderr, stepsUsed: step - 1 };
    }

    if (abortSignal?.aborted) {
      callbacks.onEvent({ type: 'user_takeover', reason: 'Aborted by user' });
      return { success: false, finalStderr: lastStderr, stepsUsed: step - 1 };
    }

    const applyRes = await callbacks.applyDiff(currentDiff, worktree.path);
    if (!applyRes.ok) {
      diffFailStreak++;
      callbacks.onEvent({
        type: 'diff_fail_streak_reached',
        count: diffFailStreak,
        lastError: applyRes.error,
      });

      if (diffFailStreak >= config.diffFailStreak) {
        return {
          success: false,
          finalStderr: `Diff apply failed ${diffFailStreak} times (streak cap). Last: ${applyRes.error}`,
          stepsUsed: step,
        };
      }

      currentDiff = await callbacks.onDiffApplyFailed(applyRes.error, currentDiff);
      continue;
    }
    callbacks.onEvent({ type: 'diff_applied', filePath: worktree.path });
    diffFailStreak = 0;

    callbacks.onEvent({ type: 'command_start', command: testCommand });
    const result = await runCmd(worktree, testCommand, config.commandTimeout);
    callbacks.onEvent({
      type: 'command_done',
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    });

    if (result.exitCode === 0) {
      callbacks.onEvent({ type: 'success' });
      return { success: true, stepsUsed: step };
    }

    if (result.stderr === lastStderr) {
      consecutiveSame++;
      callbacks.onEvent({ type: 'consecutive_same_error', count: consecutiveSame });
      if (consecutiveSame >= config.maxConsecutiveSameError) {
        callbacks.onEvent({
          type: 'user_takeover',
          reason: `Same error ${consecutiveSame} times in a row`,
        });
        return { success: false, finalStderr: result.stderr, stepsUsed: step };
      }
    } else {
      consecutiveSame = 0;
    }
    lastStderr = result.stderr;

    currentDiff = await callbacks.onCommandFailed(result.stderr, currentDiff);
  }

  callbacks.onEvent({ type: 'step_cap_reached' });
  return { success: false, finalStderr: lastStderr, stepsUsed: config.maxSteps };
}
