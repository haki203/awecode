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

import { parseDiff } from '@awecode/diff';
import type { ParsedDiff } from '@awecode/diff';

export interface ParsedDiffBlock {
  text: string;
  filePath: string;
  parsed: ParsedDiff;
}

const FILE_PATH_PREFIX = 'file_path:';

/**
 * Extracts diff blocks from assistant text. Each block starts with
 * `file_path: <path>` followed by `<<<< SEARCH ... ==== ... >>>> REPLACE`.
 *
 * Strategy: split on `file_path:` occurrences, parse each chunk via
 * `parseDiff` from `@awecode/diff`. If a chunk has no SEARCH/REPLACE markers,
 * it's skipped (e.g. leading prose before the first diff).
 *
 * Note: `parseDiff` returns `ParsedDiff[]` (one entry per `file_path:` line
 * in the input). Since each chunk here is sliced to contain exactly one
 * `file_path:` line, we take element [0].
 */
export function parseAssistantDiff(text: string): ParsedDiffBlock[] {
  const blocks: ParsedDiffBlock[] = [];

  let pos = 0;
  while (pos < text.length) {
    const nextIdx = text.indexOf(FILE_PATH_PREFIX, pos);
    if (nextIdx === -1) break;

    const afterCurrent = nextIdx + FILE_PATH_PREFIX.length;
    const nextFileIdx = text.indexOf(FILE_PATH_PREFIX, afterCurrent);
    const chunkEnd = nextFileIdx === -1 ? text.length : nextFileIdx;
    const chunk = text.slice(nextIdx, chunkEnd);

    if (chunk.includes('<<<< SEARCH') && chunk.includes('>>>> REPLACE')) {
      const parsed = parseDiff(chunk);
      if (parsed.length > 0 && parsed[0]?.filePath) {
        blocks.push({
          text: chunk,
          filePath: parsed[0].filePath,
          parsed: parsed[0],
        });
      }
    }

    pos = afterCurrent;
  }

  return blocks;
}
