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
 * Phase 1 (this file): parses diff text into blocks, then prompts the user to
 * approve ALL blocks before any git/pipeline work begins. The pipeline itself
 * (`runPipeline`) is a stub here — full implementation lands in Task 9.
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
   * Pipeline stub. Real implementation (worktree → apply → self-heal → merge →
   * commit → cleanup) arrives in Task 9. For Phase 1 testing we only need the
   * happy/abort paths through the approval phase, so we succeed without doing
   * any git work.
   */
  private async runPipeline(
    blocks: ParsedDiffBlock[],
  ): Promise<DiffCycleResult> {
    if (blocks.length === 0) {
      return {
        success: false,
        mergedFiles: [],
        error: 'No blocks approved',
        phase: 'failed',
      };
    }

    this.setPhase('success');
    return {
      success: true,
      mergedFiles: blocks.map((b) => b.filePath),
      phase: 'success',
    };
  }

  async abort(): Promise<void> {
    this.abortFlag = true;
  }
}
