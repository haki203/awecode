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
import { join } from 'node:path';
import { mkdir, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { Worktree } from './types.js';

export async function createWorktree(projectRoot: string): Promise<Worktree> {
  const uuid = randomUUID();
  const worktreesDir = join(projectRoot, '.awecode', 'worktrees');
  const worktreePath = join(worktreesDir, uuid);
  const branch = `agent/${uuid}`;
  const createdAt = Date.now();

  await mkdir(worktreesDir, { recursive: true });

  const git = simpleGit(projectRoot);
  await git.raw(['worktree', 'add', worktreePath, '-b', branch]);

  return { uuid, path: worktreePath, branch, createdAt };
}

export async function listWorktrees(projectRoot: string): Promise<Worktree[]> {
  const git = simpleGit(projectRoot);
  const output = await git.raw(['worktree', 'list', '--porcelain']);

  const lines = output.split('\n');
  const worktrees: Worktree[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith('worktree ') && line.includes('.awecode')) {
      const path = line.slice('worktree '.length).trim();
      const uuid = path.split(/[\\/]/).pop() ?? '';
      if (!uuid) continue;

      // Get branch from subsequent lines
      let branch = `agent/${uuid}`;
      for (let j = i + 1; j < lines.length && lines[j]; j++) {
        const branchLine = lines[j]!;
        if (branchLine.startsWith('branch ')) {
          const ref = branchLine.slice('branch '.length).trim();
          branch = ref.replace('refs/heads/', '');
          break;
        }
        if (branchLine.startsWith('worktree ')) break;
      }

      // Get createdAt from dir mtime
      let createdAt = 0;
      try {
        const s = await stat(path);
        createdAt = s.mtimeMs;
      } catch {
        // skip
      }

      worktrees.push({ uuid, path, branch, createdAt });
    }
  }
  return worktrees;
}

export async function removeWorktree(projectRoot: string, uuid: string): Promise<void> {
  const git = simpleGit(projectRoot);
  const worktreePath = join(projectRoot, '.awecode', 'worktrees', uuid);
  const branch = `agent/${uuid}`;

  await git.raw(['worktree', 'remove', worktreePath, '--force']);
  try {
    await git.raw(['branch', '-D', branch]);
  } catch {
    // branch may not exist if already deleted
  }
}

export async function cleanStaleWorktrees(
  projectRoot: string,
  maxAgeMs: number = 24 * 60 * 60 * 1000,
): Promise<string[]> {
  const worktrees = await listWorktrees(projectRoot);
  const now = Date.now();
  const removed: string[] = [];

  for (const wt of worktrees) {
    if (now - wt.createdAt > maxAgeMs) {
      await removeWorktree(projectRoot, wt.uuid);
      removed.push(wt.uuid);
    }
  }
  return removed;
}
