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

import { spawn } from 'node:child_process';
import type { Worktree } from './types.js';

export interface RunCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runCommand(
  worktree: Worktree,
  command: string,
  timeoutMs: number = 60_000,
): Promise<RunCommandResult> {
  const isWin = process.platform === 'win32';
  const shell = isWin ? 'powershell.exe' : '/bin/bash';
  const shellArgs = isWin
    ? ['-NoProfile', '-NonInteractive', '-Command', command]
    : ['-c', command];

  return new Promise((resolve) => {
    const child = spawn(shell, shellArgs, { cwd: worktree.path });
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, 2000);
    }, timeoutMs);

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (exitCode: number | null) => {
      clearTimeout(timer);
      if (timedOut) {
        resolve({
          exitCode: 124, // standard timeout exit code
          stdout,
          stderr: `Command timed out after ${timeoutMs}ms`,
        });
        return;
      }
      resolve({
        exitCode: exitCode ?? 1,
        stdout,
        stderr,
      });
    });

    child.on('error', (err: Error) => {
      clearTimeout(timer);
      resolve({
        exitCode: 1,
        stdout,
        stderr: `Spawn error: ${err.message}`,
      });
    });
  });
}
