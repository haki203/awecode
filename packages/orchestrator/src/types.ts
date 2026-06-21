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

import type { ModelMessage } from 'ai';
import type { ContextManager, ApprovalQueue, ApprovalDecision } from '@awecode/agent';
import type { SelfHealConfig, SelfHealEvent, Worktree, CommitStrategy } from '@awecode/harness';

export type OrchestratorPhase =
  | 'idle'
  | 'parsing'
  | 'approving'
  | 'creating_worktree'
  | 'applying_diff'
  | 'self_healing'
  | 'merging'
  | 'committing'
  | 'cleaning_up'
  | 'success'
  | 'failed'
  | 'aborted';

export interface OrchestratorOptions {
  projectRoot: string;
  context: ContextManager;
  approvalQueue: ApprovalQueue;
  selfHealConfig?: SelfHealConfig;
  commitStrategy?: CommitStrategy;
  taskUuid: string;
  abortSignal?: AbortSignal;
  chatMessages: ModelMessage[];
  onWorktreeCreated?: (wt: Worktree) => void;
  onSelfHealEvent?: (e: SelfHealEvent) => void;
  onApprovalRequest?: (req: { filePath: string }) => void;
  onApprovalDecision?: (decision: ApprovalDecision) => void;
  onPhaseChange?: (phase: OrchestratorPhase) => void;
}

export interface DiffCycleResult {
  success: boolean;
  mergedFiles: string[];
  worktreeUuid?: string;
  error?: string;
  phase: OrchestratorPhase;
}
