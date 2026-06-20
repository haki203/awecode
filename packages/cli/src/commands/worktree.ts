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

import {
  listWorktrees,
  removeWorktree,
  cleanStaleWorktrees,
} from '@awecode/harness';

export async function worktreeCommand(args: string[]): Promise<void> {
  const sub = args[0];

  if (sub === 'list' || sub === 'ls') {
    const wts = await listWorktrees(process.cwd());
    if (wts.length === 0) {
      console.log('No worktrees.');
    } else {
      for (const wt of wts) {
        const age = Math.round((Date.now() - wt.createdAt) / 60_000);
        console.log(`${wt.uuid}  ${wt.branch}  (${age}m ago)  ${wt.path}`);
      }
      console.log(`\n${wts.length} worktree(s).`);
    }
    return;
  }

  if (sub === 'clean') {
    const uuid = args[1];
    if (uuid) {
      await removeWorktree(process.cwd(), uuid);
      console.log(`Removed worktree ${uuid}`);
    } else {
      const removed = await cleanStaleWorktrees(process.cwd());
      if (removed.length === 0) {
        console.log('No stale worktrees to clean.');
      } else {
        console.log(`Cleaned ${removed.length} stale worktree(s):`);
        for (const id of removed) {
          console.log(`  ${id}`);
        }
      }
    }
    return;
  }

  // Help
  console.log(`Usage: awecode worktree <command>

Commands:
  list, ls              List active worktrees
  clean [<uuid>]        Remove worktree by UUID, or clean all stale (>24h) if no UUID
`);
}
