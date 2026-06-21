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
import type { ContextEntry } from '@awecode/agent';
import { colors } from '../theme.js';

interface Props {
  entries: readonly ContextEntry[];
  used: number;
  budget: number;
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

/**
 * Compact one-line context meter inspired by Codex / OpenCode statuslines.
 *
 * Renders a thin sliver at the bottom of the screen showing the context
 * budget utilization as both a percentage and a tiny inline bar. Intended
 * to live inside a StatusBar; not meant to fill the screen like the legacy
 * ContextPanel did.
 */
export function ContextStatusline({ entries, used, budget }: Props) {
  const rawPct = budget > 0 ? Math.round((used / budget) * 100) : 0;
  const pct = Math.max(0, Math.min(100, rawPct));
  const color =
    pct >= 95 ? colors.severe : pct >= 85 ? colors.moderate : colors.ok;

  // 10-cell mini bar — small enough to fit a 1-line statusline on 80-col terms
  const filled = Math.round(pct / 10);
  const bar =
    '━'.repeat(Math.min(filled, 10)) + '╌'.repeat(Math.max(0, 10 - filled));

  return (
    <Box gap={1}>
      <Text color={colors.muted}>ctx</Text>
      <Text color={color}>{bar}</Text>
      <Text color={color} bold>
        {pct}%
      </Text>
      <Text color={colors.muted}>
        {formatTokens(used)}/{formatTokens(budget)}
      </Text>
      <Text color={colors.muted}>·</Text>
      <Text color={colors.muted}>{entries.length} files</Text>
    </Box>
  );
}
