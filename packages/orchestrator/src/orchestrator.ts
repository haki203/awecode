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

import { parseAssistantDiff } from './diff-interceptor.js';
import { ApprovalPrompter } from './approval.js';
import { detectTestCommand } from './test-detect.js';
import {
  createWorktree,
  removeWorktree,
  runSelfHealLoop,
  mergeToWorkingDir,
  runCommand,
  DEFAULT_SELF_HEAL_CONFIG,
} from '@awecode/harness';
import { applyDiff as applyDiffToContent } from '@awecode/diff';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import type {
  Worktree,
  SelfHealEvent,
  SelfHealCallbacks,
  RunCommandFn,
  CommitStrategy,
} from '@awecode/harness';
import type {
  OrchestratorOptions,
  OrchestratorPhase,
  DiffCycleResult,
} from './types.js';
import type { ApprovalDecision } from '@awecode/agent';
import type { ParsedDiffBlock } from './diff-interceptor.js';

/**
 * Orchestrates a single parse → approve → pipeline cycle for assistant-emitted
 * diffs.
 *
 * Phase 2 (this file): after the user approves blocks, `runPipeline` spins up
 * a worktree, applies each block's diff, runs the self-heal loop against a
 * test command, merges the worktree branch back into the working directory,
 * commits, and cleans up the worktree. Per-block failures (apply or test)
 * surface as feedback messages injected into `chatMessages` so the next LLM
 * turn can regenerate a corrected diff.
 *
 * Approval semantics (see `ApprovalDecision` in `@awecode/agent`):
 *   accept     — approve this block
 *   accept_all — approve this block and all remaining (no further prompts)
 *   reject     — skip this block, continue prompting
 *   edit       — v0.1: treated as accept (real edit UI is Plan 5b)
 *   skip_all   — stop prompting; proceed to pipeline with whatever's approved
 *   quit       — abort the entire cycle immediately
 */
export class Orchestrator {
  private phase: OrchestratorPhase = 'idle';
  private abortFlag = false;
  /**
   * Cached result of `detectTestCommand`. `undefined` = not yet probed;
   * `null` = probed but no test command detected (fall back to `true`).
   */
  private cachedTestCmd: { command: string; reason: string } | null | undefined;

  constructor(private opts: OrchestratorOptions) {}

  private setPhase(p: OrchestratorPhase): void {
    this.phase = p;
    this.opts.onPhaseChange?.(p);
  }

  async handleDiffDetected(diffText: string): Promise<DiffCycleResult> {
    this.setPhase('parsing');
    const blocks = parseAssistantDiff(diffText);
    if (blocks.length === 0) {
      return {
        success: false,
        mergedFiles: [],
        error: 'No diff blocks found',
        phase: 'failed',
      };
    }

    this.setPhase('approving');
    const prompter = new ApprovalPrompter({ abortSignal: this.opts.abortSignal });
    const approvedBlocks: ParsedDiffBlock[] = [];
    let acceptAll = false;

    for (const block of blocks) {
      if (this.abortFlag || this.opts.abortSignal?.aborted) {
        return {
          success: false,
          mergedFiles: [],
          phase: 'aborted',
        };
      }

      let decision: ApprovalDecision;
      if (acceptAll) {
        decision = 'accept';
      } else {
        this.opts.onApprovalRequest?.({ filePath: block.filePath });
        decision = await prompter.prompt(block);
        this.opts.onApprovalDecision?.(decision);
      }

      switch (decision) {
        case 'accept':
          approvedBlocks.push(block);
          break;
        case 'accept_all':
          acceptAll = true;
          approvedBlocks.push(block);
          break;
        case 'reject':
          // skip this block
          break;
        case 'edit':
          // v0.1: treat as accept (real edit UI in Plan 5b)
          approvedBlocks.push(block);
          break;
        case 'skip_all':
          return await this.runPipeline(approvedBlocks);
        case 'quit':
          this.abortFlag = true;
          return {
            success: false,
            mergedFiles: [],
            phase: 'aborted',
          };
        case 'skip':
          // v0.1: alias for reject (single-block skip). Kept for completeness
          // against the 7-value ApprovalDecision type; ApprovalPrompter never
          // returns it but external callers could.
          break;
      }
    }

    return await this.runPipeline(approvedBlocks);
  }

  /**
   * Full pipeline (Phase 2):
   *   create worktree → for each block: apply → self-heal → merge → commit
   *   → remove worktree.
   *
   * Single worktree is shared across all blocks in the cycle. On any
   * per-block failure we surface a feedback message into `chatMessages` and
   * bail (Q7/A). The worktree is kept on failure so the caller can inspect;
   * on success it is removed.
   *
   * API notes:
   *   - `applyDiff` from `@awecode/diff` takes `(source, blocks)`, NOT a path.
   *     We read content from the worktree, apply, write back.
   *   - The self-heal loop forwards the raw diff text to the `applyDiff`
   *     callback, but we already have a parsed block — we ignore the raw text
   *     and use the block directly (v0.1: one block per self-heal invocation).
   */
  private async runPipeline(
    blocks: ParsedDiffBlock[],
  ): Promise<DiffCycleResult> {
    if (blocks.length === 0) {
      this.setPhase('failed');
      return {
        success: false,
        mergedFiles: [],
        error: 'No blocks approved',
        phase: 'failed',
      };
    }

    // Detect test command (cached across cycles). `true` is a shell no-op so
    // projects without a recognizable test runner still complete the pipeline.
    if (this.cachedTestCmd === undefined) {
      this.cachedTestCmd = await detectTestCommand(this.opts.projectRoot);
    }
    const testCmd = this.cachedTestCmd?.command ?? 'true';

    this.setPhase('creating_worktree');
    let wt: Worktree;
    try {
      wt = await createWorktree(this.opts.projectRoot);
      this.opts.onWorktreeCreated?.(wt);
    } catch (err) {
      this.setPhase('failed');
      return {
        success: false,
        mergedFiles: [],
        error: `createWorktree failed: ${(err as Error).message}`,
        phase: 'failed',
      };
    }

    const mergedFiles: string[] = [];
    const runCmd: RunCommandFn = this.opts.runCommandOverride ?? runCommand;

    // applyDiff: read content from worktree, apply parsed blocks, write back.
    // The override (when provided) bypasses file IO entirely — used by tests
    // and by future diff-interceptor flows that already have the new content.
    const applyDiffFn = this.opts.applyDiffOverride ??
      (async (block: ParsedDiffBlock, worktreePath: string) => {
        try {
          const filePath = join(worktreePath, block.filePath);
          const content = await readFile(filePath, 'utf-8');
          const result = applyDiffToContent(content, block.parsed.blocks);
          if (!result.ok) {
            return { ok: false as const, error: 'apply failed' };
          }
          await writeFile(filePath, result.result, 'utf-8');
          return { ok: true as const };
        } catch (err) {
          return { ok: false as const, error: (err as Error).message };
        }
      });

    try {
      for (const block of blocks) {
        if (this.abortFlag || this.opts.abortSignal?.aborted) {
          this.setPhase('aborted');
          return { success: false, mergedFiles, phase: 'aborted' };
        }

        this.setPhase('applying_diff');
        this.setPhase('self_healing');

        const callbacks: SelfHealCallbacks = {
          onEvent: (e: SelfHealEvent) => this.opts.onSelfHealEvent?.(e),
          onCommandFailed: async (stderr, lastDiff) => {
            this.opts.chatMessages.push({
              role: 'user',
              content: `The test command failed with:\n${stderr}\n\nLast diff:\n${lastDiff}\n\nPlease generate a new diff to fix this.`,
            });
            return '[awaiting LLM regeneration in next iteration]';
          },
          onDiffApplyFailed: async (error, lastDiff) => {
            this.opts.chatMessages.push({
              role: 'user',
              content: `Diff apply failed: ${error}\n\nLast diff:\n${lastDiff}\n\nPlease generate a new diff.`,
            });
            return '[awaiting LLM regeneration in next iteration]';
          },
          applyDiff: async (_diffText: string, worktreePath: string) => {
            // Self-heal loop forwards raw diff text; we discard it and use
            // the already-parsed block (one block per invocation in v0.1).
            return applyDiffFn(block, worktreePath);
          },
        };

        const healResult = await runSelfHealLoop(
          wt,
          block.text,
          testCmd,
          this.opts.selfHealConfig ?? DEFAULT_SELF_HEAL_CONFIG,
          callbacks,
          runCmd,
          this.opts.abortSignal,
        );

        if (!healResult.success) {
          this.setPhase('failed');
          return {
            success: false,
            mergedFiles,
            worktreeUuid: wt.uuid,
            error: healResult.finalStderr,
            phase: 'failed',
          };
        }

        // Commit inside the worktree so `mergeToWorkingDir` (git-merge) has a
        // commit to bring over. With the worktree branch ahead of projectRoot
        // HEAD by exactly this commit, the merge fast-forwards — so the final
        // commit on projectRoot carries the awecode-prefixed message.
        this.setPhase('committing');
        const strategy: CommitStrategy = this.opts.commitStrategy ?? 'per-task';
        const message =
          strategy === 'per-block'
            ? `awecode: ${this.opts.taskUuid} — ${block.filePath}`
            : `awecode: ${this.opts.taskUuid}`;
        const wtGit = simpleGit(wt.path);
        await wtGit.add(join(wt.path, block.filePath));
        await wtGit.commit(message);

        this.setPhase('merging');
        const mergeResult = await mergeToWorkingDir(this.opts.projectRoot, wt, {
          mode: 'git-merge',
        });
        if (!mergeResult.ok) {
          // Q8/B: keep worktree on merge conflict, let caller decide.
          this.setPhase('failed');
          return {
            success: false,
            mergedFiles,
            worktreeUuid: wt.uuid,
            error: `Merge conflict: ${mergeResult.error}`,
            phase: 'failed',
          };
        }

        mergedFiles.push(block.filePath);
      }

      this.setPhase('cleaning_up');
      await removeWorktree(this.opts.projectRoot, wt.uuid);

      this.setPhase('success');
      return {
        success: true,
        mergedFiles,
        worktreeUuid: wt.uuid,
        phase: 'success',
      };
    } catch (err) {
      this.setPhase('failed');
      return {
        success: false,
        mergedFiles,
        worktreeUuid: wt.uuid,
        error: (err as Error).message,
        phase: 'failed',
      };
    }
  }

  async abort(): Promise<void> {
    this.abortFlag = true;
  }
}
