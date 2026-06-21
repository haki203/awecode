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
import { TextInput } from '@inkjs/ui';
import { colors } from '../theme.js';

interface Props {
  onSubmit: (value: string) => void;
  placeholder?: string;
}

/**
 * Prompt input with a subtle prompt glyph, matching the Codex/OpenCode
 * single-line footer aesthetic. Wraps `@inkjs/ui`'s uncontrolled TextInput
 * (v2), so callers should still remount via `key` to clear the buffer.
 */
export function PromptInput({ onSubmit, placeholder }: Props) {
  return (
    <Box gap={1}>
      <Text color={colors.accent} bold>
        ❯
      </Text>
      <TextInput onSubmit={onSubmit} placeholder={placeholder ?? 'ask anything…'} />
    </Box>
  );
}
