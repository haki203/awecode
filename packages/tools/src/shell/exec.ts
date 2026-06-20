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
import type { ToolDefinition, ToolResult } from '../types.js';

export interface ShellExecArgs {
  command: string;
  cwd?: string;
  timeoutMs?: number;
}

export async function shellExecTool(args: ShellExecArgs): Promise<ToolResult> {
  const cwd = args.cwd ?? process.cwd();
  const timeout = args.timeoutMs ?? 60_000;
  const isWin = process.platform === 'win32';

  const shell = isWin ? 'powershell.exe' : '/bin/bash';
  const shellArgs = isWin
    ? ['-NoProfile', '-NonInteractive', '-Command', args.command]
    : ['-c', args.command];

  return new Promise((resolve) => {
    const child = spawn(shell, shellArgs, { cwd });
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      // Force kill if still alive after 2s
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, 2000);
    }, timeout);

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
          ok: false,
          error: `Command timed out after ${timeout}ms`,
        });
        return;
      }

      const output = stdout + (stderr ? `\n[stderr]\n${stderr}` : '');

      if (exitCode === 0) {
        resolve({
          ok: true,
          output,
          contextEntries: [
            {
              type: 'command-output',
              content: output,
            },
          ],
        });
      } else {
        resolve({
          ok: false,
          error: `Exit ${exitCode}\n${output}`,
        });
      }
    });

    child.on('error', (err: Error) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        error: `Failed to spawn: ${err.message}`,
      });
    });
  });
}

export const shellExecDef: ToolDefinition = {
  name: 'shell_exec',
  description:
    'Execute a shell command. Uses PowerShell on Windows, bash on Linux/macOS. Returns stdout, stderr, and exit code. Subject to timeoutMs (default 60s).',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Shell command to execute',
      },
      cwd: {
        type: 'string',
        description: 'Working directory (defaults to process.cwd())',
      },
      timeoutMs: {
        type: 'number',
        description: 'Timeout in milliseconds (default 60000)',
      },
    },
    required: ['command'],
  },
};
