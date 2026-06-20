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

import fastGlob from 'fast-glob';
import { sep, posix } from 'node:path';
import type { ToolDefinition, ToolResult } from '../types.js';

const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.awecode/**',
  '**/dist/**',
];

export interface ListFilesArgs {
  pattern: string;
  cwd?: string;
}

export async function listFilesTool(args: ListFilesArgs): Promise<ToolResult> {
  try {
    const files = await fastGlob(args.pattern, {
      cwd: args.cwd ?? process.cwd(),
      ignore: DEFAULT_IGNORE,
      dot: false,
      onlyFiles: true,
    });
    // Normalize to forward slashes for cross-platform consistency
    const normalized = files.map((f) => f.split(sep).join(posix.sep));
    return {
      ok: true,
      output: normalized.join('\n'),
    };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to list files: ${(err as Error).message}`,
    };
  }
}

export const listFilesDef: ToolDefinition = {
  name: 'list_files',
  description:
    'List files matching a glob pattern (e.g. "**/*.ts"). Automatically excludes node_modules, .git, .awecode, dist.',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob pattern, e.g. "**/*.ts" or "src/**"',
      },
      cwd: {
        type: 'string',
        description: 'Working directory (defaults to process.cwd())',
      },
    },
    required: ['pattern'],
  },
};
