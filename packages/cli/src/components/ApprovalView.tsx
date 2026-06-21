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

import { Box, Text, useInput } from 'ink';
import type { ApprovalRequest, ApprovalDecision } from '@awecode/agent';
import { colors } from '../theme.js';
import { DiffPreview } from './DiffPreview.js';

interface Props {
  request: ApprovalRequest;
  blockIndex: number;
  onDecision: (decision: ApprovalDecision) => void;
}

export function ApprovalView({ request, blockIndex, onDecision }: Props) {
  useInput((input, _key) => {
    if (input === 'y') onDecision('accept');
    else if (input === 'n') onDecision('reject');
    else if (input === 's') onDecision('skip');
  });

  const block = request.parsedDiff.blocks[blockIndex];

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={colors.borderStrong} paddingX={1}>
      <Box gap={1}>
        <Text color={colors.accent} bold>
          Diff Approval
        </Text>
        <Text color={colors.muted}>·</Text>
        <Text bold>{request.filePath}</Text>
      </Box>
      <Text> </Text>
      {block && (
        <DiffPreview
          block={block}
          blockIndex={blockIndex}
          totalBlocks={request.parsedDiff.blocks.length}
        />
      )}
      <Text> </Text>
      <Box gap={2}>
        <Box gap={1}>
          <Text color={colors.agent} bold>
            [y]
          </Text>
          <Text color={colors.muted}>accept</Text>
        </Box>
        <Box gap={1}>
          <Text color={colors.danger} bold>
            [n]
          </Text>
          <Text color={colors.muted}>reject</Text>
        </Box>
        <Box gap={1}>
          <Text color={colors.warn} bold>
            [s]
          </Text>
          <Text color={colors.muted}>skip</Text>
        </Box>
      </Box>
    </Box>
  );
}
