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

export interface Worktree {
  uuid: string;
  path: string;
  branch: string;
  createdAt: number;
}

export type SandboxMode = 'git-only' | 'docker';

export interface SandboxConfig {
  mode: SandboxMode;
  isolateNetwork: boolean;
  commandTimeout: number;
  totalTimeout: number;
}

export interface SelfHealConfig {
  maxSteps: number;
  maxConsecutiveSameError: number;
  totalTimeout: number;
  commandTimeout: number;
  diffFailStreak: number;
}

export type SelfHealEvent =
  | { type: 'step_start'; step: number }
  | { type: 'command_start'; command: string }
  | { type: 'command_done'; exitCode: number; stdout: string; stderr: string }
  | { type: 'diff_applied'; filePath: string }
  | { type: 'consecutive_same_error'; count: number }
  | { type: 'step_cap_reached' }
  | { type: 'user_takeover'; reason: string }
  | { type: 'success' };
