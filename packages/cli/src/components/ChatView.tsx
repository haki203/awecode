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
import type { ReactNode } from 'react';
import { colors } from '../theme.js';
import { Spinner } from './Spinner.js';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
}

interface Props {
  messages: ChatMessage[];
  isStreaming: boolean;
  workflowIndicator?: ReactNode | null;
}

// Compact prefix glyphs (left column) instead of the verbose "You: " / "Agent: ".
// Matches the aesthetic Codex/OpenCode use: single-line roles, color-coded.
function renderMessage(msg: ChatMessage): ReactNode {
  if (msg.role === 'user') {
    return (
      <Box gap={1}>
        <Text color={colors.user} bold>
          ❯
        </Text>
        <Text>{msg.content}</Text>
      </Box>
    );
  }
  if (msg.role === 'assistant') {
    return (
      <Box gap={1}>
        <Text color={colors.agent} bold>
          ●
        </Text>
        <Text>{msg.content}</Text>
      </Box>
    );
  }
  // tool — dim, single line, truncated hard so it never dominates
  const summary = msg.content.length > 80 ? `${msg.content.slice(0, 77)}…` : msg.content;
  return (
    <Box gap={1}>
      <Text color={colors.tool}>↳</Text>
      <Text color={colors.tool}>{summary}</Text>
    </Box>
  );
}

export function ChatView({ messages, isStreaming, workflowIndicator }: Props) {
  return (
    <Box flexDirection="column" gap={0}>
      {workflowIndicator != null && (
        <Box marginBottom={1}>{workflowIndicator}</Box>
      )}
      {messages.map((msg, i) => (
        <Box
          key={i}
          marginBottom={i < messages.length - 1 || isStreaming ? 0 : 0}
        >
          {renderMessage(msg)}
        </Box>
      ))}
      {isStreaming && <Spinner label="thinking" />}
    </Box>
  );
}
