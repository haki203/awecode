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

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { sep, posix } from 'node:path';
import fastGlob from 'fast-glob';
import type { ToolDefinition, ToolResult } from '../types.js';

const execFileAsync = promisify(execFile);

const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.awecode/**',
  '**/dist/**',
];

const DEFAULT_GLOB = '**/*.{ts,tsx,js,jsx,py,go,rs,java,c,cpp,h,md,yaml,yml,json}';

export interface SearchFilesArgs {
  pattern: string;
  path?: string;
  glob?: string;
}

// Normalize path separators in a single rg result line to forward slashes so
// Windows output (`sub\c.ts`) matches the canonical form tests/callers expect
// (`sub/c.ts`). Only separators are rewritten; drive letters and the literal
// `:` line/col delimiters are preserved.
function normalizeLine(line: string): string {
  if (sep === posix.sep) return line;
  return line.split(sep).join(posix.sep);
}

export async function searchFilesTool(args: SearchFilesArgs): Promise<ToolResult> {
  const cwd = args.path ?? process.cwd();

  // Try ripgrep first (fast path).
  try {
    const rgArgs = [
      '--line-number',
      '--no-heading',
      '--color=never',
      '--no-ignore',
    ];
    // Emit `-g !<glob>` for every DEFAULT_IGNORE entry so rg skips the same
    // directories the JS fallback does (.awecode/, dist/ included). Previously
    // only indices [0] and [1] were passed, leaking hits from [2]/[3].
    for (const ignoreGlob of DEFAULT_IGNORE) {
      rgArgs.push('-g', `!${ignoreGlob}`);
    }
    rgArgs.push(args.pattern, cwd);
    const { stdout } = await execFileAsync('rg', rgArgs, { timeout: 30_000 });
    return { ok: true, output: stdout.split('\n').map(normalizeLine).join('\n').trim() };
  } catch (err) {
    // execFile rejects on non-zero exit OR spawn failure:
    //   - rg not installed (ENOENT)            -> fall through to JS scan.
    //   - rg ran but found no matches (exit 1) -> stdout is '', return empty.
    //   - rg ran with other non-zero status    -> if stdout captured, return it;
    //                                              otherwise fall through to JS scan.
    const e = err as NodeJS.ErrnoException & {
      code?: string | number;
      stdout?: string;
      stderr?: string;
    };
    if (e.code === 'ENOENT') {
      // rg not available — fall through to JS scan below.
    } else if (typeof e.stdout === 'string') {
      return {
        ok: true,
        output: e.stdout.split('\n').map(normalizeLine).join('\n').trim(),
      };
    } else {
      // Unknown spawn-time error with no stdout — fall through to JS scan.
    }
  }

  // JS fallback (fast-glob + RegExp scan).
  try {
    const files = await fastGlob(args.glob ?? DEFAULT_GLOB, {
      cwd,
      ignore: DEFAULT_IGNORE,
      dot: false,
    });
    const re = new RegExp(args.pattern);
    const matches: string[] = [];

    for (const f of files.slice(0, 200)) {
      const fullPath = `${cwd}/${f}`;
      const content = await readFile(fullPath, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line !== undefined && re.test(line)) {
          matches.push(`${f}:${i + 1}:${line}`);
        }
      }
    }

    return { ok: true, output: matches.join('\n') };
  } catch (err) {
    return {
      ok: false,
      error: `Search failed: ${(err as Error).message}`,
    };
  }
}

export const searchFilesDef: ToolDefinition = {
  name: 'search_files',
  description:
    'Search for a regex pattern across files. Returns matches as file:line:content. Uses ripgrep if available, falls back to JS scan.',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Regex pattern (e.g. "function \\w+" or "TODO")',
      },
      path: {
        type: 'string',
        description: 'Search root directory (defaults to process.cwd())',
      },
      glob: {
        type: 'string',
        description: 'Optional file glob to limit search (defaults to common code files)',
      },
    },
    required: ['pattern'],
  },
};
