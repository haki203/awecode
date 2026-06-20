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

interface Props {
  entries: readonly ContextEntry[];
  totalTokens: number;
  budget: number;
}

export function ContextPanel({ entries, totalTokens, budget }: Props) {
  // Clamp to [0, 100] so a runaway totalTokens (> budget) can never overflow the
  // 20-cell progress bar (`'░'.repeat(20 - ...)` would otherwise receive a
  // negative arg and throw RangeError). See Task 15 review notes.
  const rawPct = budget > 0 ? Math.round((totalTokens / budget) * 100) : 0;
  const pct = Math.max(0, Math.min(100, rawPct));
  const color = pct >= 95 ? 'red' : pct >= 85 ? 'yellow' : 'green';

  return (
    <Box flexDirection="column">
      <Text bold>
        Context ({totalTokens.toLocaleString()} / {budget.toLocaleString()})
      </Text>
      <Text color={color}>
        {'█'.repeat(Math.floor(pct / 5))}
        {'░'.repeat(20 - Math.floor(pct / 5))}
      </Text>
      <Text> </Text>
      {entries.map((e) => (
        <Text key={e.id}>
          [{e.addedBy}] {e.path ?? `[${e.type}]`} ({e.tokens} tok)
        </Text>
      ))}
    </Box>
  );
}
