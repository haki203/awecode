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

interface Props {
  model?: string;
  hint?: string;
  context?: ReactNode;
  right?: ReactNode;
}

/**
 * Single-line statusbar at the very bottom of the awecode TUI. Hosts the
 * model id (left), keybinding hints (right), and the compact context meter.
 * Intentionally minimal — this is the *only* persistent chrome; everything
 * else is content or on-demand overlay.
 */
export function StatusBar({ model, hint, context, right }: Props) {
  return (
    <Box gap={1} paddingX={0}>
      {model && (
        <>
          <Text color={colors.accent} bold>
            awecode
          </Text>
          <Text color={colors.muted}>·</Text>
          <Text color={colors.tool}>{model}</Text>
          <Text color={colors.muted}>·</Text>
        </>
      )}
      {context}
      <Box flexGrow={1} />
      {hint && <Text color={colors.muted}>{hint}</Text>}
      {right}
    </Box>
  );
}
