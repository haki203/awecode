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

import { simpleGit } from 'simple-git';
import type { Worktree } from './types.js';

export interface MergeOptions {
  mode: 'git-merge' | 'file-copy';
}

export type MergeResult =
  | { ok: true; commitSha: string }
  | { ok: true; mode: 'file-copy'; filesCopied: number }
  | { ok: false; error: string; conflicts?: string[] };

export async function mergeToWorkingDir(
  projectRoot: string,
  worktree: Worktree,
  options: MergeOptions = { mode: 'git-merge' },
): Promise<MergeResult> {
  const git = simpleGit(projectRoot);

  if (options.mode === 'git-merge') {
    try {
      const result = await git.merge([worktree.branch, '--no-edit']);

      // Check for conflicts
      // simple-git returns conflicts in result.conflicts or via status
      const status = await git.status();
      if (status.conflicted.length > 0) {
        return {
          ok: false,
          error: 'Merge conflicts detected',
          conflicts: status.conflicted,
        };
      }

      const commitSha = (await git.revparse(['HEAD'])).trim();
      return { ok: true, commitSha };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  // file-copy mode — v0.1 basic impl
  // For now, return unsupported
  return {
    ok: false,
    error: 'file-copy merge mode not yet implemented in v0.1',
  };
}
