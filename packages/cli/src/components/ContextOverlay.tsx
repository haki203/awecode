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
import { colors, entryTypeGlyph } from '../theme.js';
import { TokenBar } from './TokenBar.js';

interface Props {
  entries: readonly ContextEntry[];
  totalTokens: number;
  budget: number;
  maxHeight?: number;
}

function formatPath(e: ContextEntry): string {
  if (e.path) {
    return e.lines ? `${e.path}:${e.lines.start}-${e.lines.end}` : e.path;
  }
  return `[${e.type}]`;
}

function formatBytes(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/**
 * On-demand context details panel, shown as an overlay when the user presses
 * the dedicated key (default: `c`). Replaces the legacy always-on ContextPanel
 * that used to occupy 40% of the screen.
 *
 * Content is windowed to `maxHeight` rows (most recent first) so it never
 * overflows the terminal — addressing the "context takes up the whole screen"
 * complaint. The caller is responsible for the surrounding border / focus.
 */
export function ContextOverlay({
  entries,
  totalTokens,
  budget,
  maxHeight = 12,
}: Props) {
  const pct = budget > 0 ? Math.round((totalTokens / budget) * 100) : 0;
  const showCompactionHint = pct >= 85;

  // Most recent entries first; window to maxHeight - reserved rows.
  // Reserved rows: 1 (tokenbar) + 1 (spacer) + 1 (optional hint) + 1 (header).
  const reserved = showCompactionHint ? 4 : 3;
  const listRows = Math.max(0, maxHeight - reserved);
  const recent = [...entries].slice(-listRows).reverse();

  return (
    <Box flexDirection="column">
      <TokenBar used={totalTokens} budget={budget} />

      {showCompactionHint && (
        <Text color={colors.warn}>
          {' '}
          auto-compact at {pct}% — /smol to trigger manually
        </Text>
      )}

      <Text> </Text>

      {entries.length === 0 ? (
        <Text color={colors.muted}>(no context entries)</Text>
      ) : (
        <Box flexDirection="column">
          {recent.map((e) => (
            <Box key={e.id} gap={1}>
              <Text color={colors.accent}>{entryTypeGlyph(e.type)}</Text>
              <Text color={colors.tool}>{formatPath(e)}</Text>
              <Text color={colors.muted}>{formatBytes(e.tokens)}t</Text>
              <Text color={colors.muted}>·</Text>
              <Text color={colors.muted}>{e.addedBy}</Text>
            </Box>
          ))}
          {entries.length > listRows && (
            <Text color={colors.muted}>
              +{entries.length - listRows} older entr
              {entries.length - listRows === 1 ? 'y' : 'ies'}…
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
}
