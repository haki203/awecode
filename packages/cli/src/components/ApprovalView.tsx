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
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text bold>Diff Approval — {request.filePath}</Text>
      <Text> </Text>
      {block && (
        <DiffPreview
          block={block}
          blockIndex={blockIndex}
          totalBlocks={request.parsedDiff.blocks.length}
        />
      )}
      <Text> </Text>
      <Text>
        <Text color="green">[y]</Text> accept{'  '}
        <Text color="red">[n]</Text> reject{'  '}
        <Text color="yellow">[s]</Text> skip
      </Text>
    </Box>
  );
}
