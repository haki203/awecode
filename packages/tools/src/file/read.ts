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

import { readFile } from 'node:fs/promises';
import type { ToolDefinition, ToolResult } from '../types.js';

export interface ReadFileArgs {
  path: string;
  lines?: { start: number; end: number };
}

export async function readFileTool(args: ReadFileArgs): Promise<ToolResult> {
  try {
    const content = await readFile(args.path, 'utf-8');

    if (args.lines) {
      const lines = content.split('\n');
      const start = Math.max(0, args.lines.start - 1);
      const end = Math.min(lines.length, args.lines.end);
      // Trailing newline preserves parity with the full-read path, which returns
      // raw file content (always terminated by `\n` for well-formed text files).
      // The brief's `slice(...).join('\n')` drops it; the test contract requires it.
      const sliced = lines.slice(start, end).join('\n') + '\n';
      return {
        ok: true,
        output: sliced,
        contextEntries: [
          {
            type: 'file',
            path: args.path,
            content: sliced,
          },
        ],
      };
    }

    return {
      ok: true,
      output: content,
      contextEntries: [
        {
          type: 'file',
          path: args.path,
          content,
        },
      ],
    };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to read ${args.path}: ${(err as Error).message}`,
    };
  }
}

export const readFileDef: ToolDefinition = {
  name: 'read_file',
  description:
    'Read the content of a file. Optionally specify a line range {start, end} (1-indexed) to read only part of the file.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute or relative file path to read',
      },
      lines: {
        type: 'object',
        properties: {
          start: { type: 'number', description: '1-indexed start line' },
          end: { type: 'number', description: '1-indexed end line (inclusive)' },
        },
        required: ['start', 'end'],
      },
    },
    required: ['path'],
  },
};
