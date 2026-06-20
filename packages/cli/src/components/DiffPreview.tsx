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

interface Props {
  block: DiffBlock;
  blockIndex: number;
  totalBlocks: number;
}

export function DiffPreview({ block, blockIndex, totalBlocks }: Props) {
  return (
    <Box flexDirection="column">
      <Text bold>
        Block {blockIndex + 1}/{totalBlocks}
        {block.anchor && (
          <Text dimColor> at: @{block.anchor.type} {block.anchor.symbol}</Text>
        )}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        <Text color="red">- {block.search.trim() || '(empty — insert)'}</Text>
        <Text color="green">+ {block.replace.trim()}</Text>
      </Box>
    </Box>
  );
}
