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

export type {
  Worktree,
  SandboxMode,
  SandboxConfig,
  SelfHealConfig,
  SelfHealEvent,
} from './types.js';

export {
  createWorktree,
  listWorktrees,
  removeWorktree,
  cleanStaleWorktrees,
} from './worktree.js';

export { runCommand } from './shell.js';
export type { RunCommandResult } from './shell.js';

export { runSelfHealLoop, DEFAULT_SELF_HEAL_CONFIG } from './selfheal.js';
export type { SelfHealCallbacks, RunCommandFn } from './selfheal.js';

export { mergeToWorkingDir } from './merge.js';
export type { MergeOptions, MergeResult } from './merge.js';

export const HARNESS_PACKAGE_VERSION = '0.0.0';
