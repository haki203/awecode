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

import type { Anchor, DiffBlock, ParsedDiff } from './types.js';

const FILE_PATH_RE = /^file_path:\s*(.+)$/;
const AT_RE = /^at:\s*@(\w+):\s*(.+)$/;
const SEARCH_OPEN = /<<<<\s*SEARCH/;
const SEP = /====/;
const REPLACE_CLOSE = />>>>\s*REPLACE/;

type CurrentBlock = Partial<DiffBlock> & { searchLines: string[]; replaceLines: string[] };

export function parseDiff(input: string): ParsedDiff[] {
  const lines = input.split('\n');
  const results: ParsedDiff[] = [];
  let current: ParsedDiff | null = null;
  let currentBlock: CurrentBlock | null = null;
  let pendingAnchor: Anchor | null = null;
  let section: 'none' | 'search' | 'replace' = 'none';

  for (const line of lines) {
    const fpMatch = line.match(FILE_PATH_RE);
    if (fpMatch) {
      if (current && currentBlock) {
        current.blocks.push(finalizeBlock(currentBlock));
      }
      current = { filePath: fpMatch[1]!.trim(), blocks: [] };
      results.push(current);
      currentBlock = null;
      pendingAnchor = null;
      continue;
    }

    const atMatch = line.match(AT_RE);
    if (atMatch) {
      const type = atMatch[1] === 'after' ? 'after' : 'before';
      const anchor: Anchor = { type, symbol: atMatch[2]!.trim() };
      if (currentBlock) {
        currentBlock.anchor = anchor;
      } else {
        pendingAnchor = anchor;
      }
      continue;
    }

    if (SEARCH_OPEN.test(line)) {
      currentBlock = { searchLines: [], replaceLines: [], anchor: pendingAnchor ?? undefined };
      pendingAnchor = null;
      section = 'search';
      continue;
    }

    if (SEP.test(line) && currentBlock) {
      section = 'replace';
      continue;
    }

    if (REPLACE_CLOSE.test(line) && currentBlock && current) {
      current.blocks.push(finalizeBlock(currentBlock));
      currentBlock = null;
      section = 'none';
      continue;
    }

    if (currentBlock && section === 'search') {
      currentBlock.searchLines.push(line);
    } else if (currentBlock && section === 'replace') {
      currentBlock.replaceLines.push(line);
    }
  }

  if (current && currentBlock) {
    current.blocks.push(finalizeBlock(currentBlock));
  }

  return results;
}

function finalizeBlock(b: { searchLines: string[]; replaceLines: string[]; anchor?: Anchor }): DiffBlock {
  const search = b.searchLines.join('\n') + (b.searchLines.length > 0 ? '\n' : '');
  const replace = b.replaceLines.join('\n') + (b.replaceLines.length > 0 ? '\n' : '');
  return { search, replace, anchor: b.anchor };
}
