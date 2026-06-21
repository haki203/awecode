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

import { Box, Text } from 'ink';
import type { DiffBlock } from '@awecode/diff';
import { colors } from '../theme.js';

interface Props {
  block: DiffBlock;
  blockIndex: number;
  totalBlocks: number;
  filePath?: string;
}

function getLanguage(filePath?: string): string {
  if (!filePath) return 'typescript';
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts': return 'typescript';
    case 'tsx': return 'tsx';
    case 'js': return 'javascript';
    case 'jsx': return 'jsx';
    case 'py': return 'python';
    case 'go': return 'go';
    case 'rs': return 'rust';
    case 'json': return 'json';
    case 'yaml':
    case 'yml': return 'yaml';
    case 'md': return 'markdown';
    default: return 'typescript';
  }
}

export function DiffPreview({ block, blockIndex, totalBlocks, filePath }: Props) {
  const lang = getLanguage(filePath);

  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <Text bold>
          Block {blockIndex + 1}/{totalBlocks}
        </Text>
        <Text color={colors.muted}>({lang})</Text>
        {block.anchor && (
          <Text color={colors.muted}>
            @{block.anchor.type} {block.anchor.symbol}
          </Text>
        )}
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text color={colors.danger}>
          - {block.search.trim() || '(empty — insert)'}
        </Text>
        <Text color={colors.agent}>+ {block.replace.trim()}</Text>
      </Box>
    </Box>
  );
}
