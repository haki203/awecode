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

import type { ApplyResult, DiffBlock } from './types.js';
import { fuzzyMatch } from './fuzzy.js';
import { resolveAnchor } from './anchor.js';

export function applyDiff(source: string, blocks: DiffBlock[]): ApplyResult {
  let result = source;

  for (const block of blocks) {
    // Case 1: insert (empty search)
    if (block.search === '') {
      if (block.anchor) {
        const anchorRes = resolveAnchor(result, block.anchor);
        if (!anchorRes.ok) {
          return {
            ok: false,
            error: 'anchor_not_found',
            anchor: block.anchor,
            suggestions: anchorRes.suggestions,
          };
        }
        const lines = result.split('\n');
        lines.splice(anchorRes.line, 0, ...block.replace.split('\n').slice(0, -1));
        result = lines.join('\n');
      } else {
        // Append at end
        result = result + (result.endsWith('\n') ? '' : '\n') + block.replace;
      }
      continue;
    }

    // Case 2: replace (non-empty search)
    const matchRes = fuzzyMatch(result, block.search);
    if (!matchRes.ok) {
      if (matchRes.error === 'no_match') {
        return {
          ok: false,
          error: 'no_match',
          block,
          bestScore: matchRes.bestScore,
          suggestions: matchRes.suggestions,
        };
      } else {
        return { ok: false, error: 'ambiguous', matches: matchRes.matches };
      }
    }

    // Replace by string replace (first occurrence)
    const idx = result.indexOf(block.search);
    if (idx !== -1) {
      result = result.slice(0, idx) + block.replace + result.slice(idx + block.search.length);
    } else {
      // Fuzzy replace — approximate
      const lines = result.split('\n');
      const startLine = matchRes.startLine;
      const endLine = matchRes.endLine;
      const newLines = block.replace.split('\n');
      lines.splice(startLine, endLine - startLine + 1, ...newLines);
      result = lines.join('\n');
    }
  }

  return { ok: true, result };
}
