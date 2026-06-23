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
import { TokenBar } from './TokenBar.js';

interface Props {
  entries: readonly ContextEntry[];
  totalTokens: number;
  budget: number;
}

export function ContextPanel({ entries, totalTokens, budget }: Props) {
  const pct = budget > 0 ? Math.round((totalTokens / budget) * 100) : 0;
  const showCompactionHint = pct >= 85;

  return (
    <Box flexDirection="column">
      <TokenBar used={totalTokens} budget={budget} />

      {showCompactionHint && (
        <Text color="yellow" dimColor>
          [auto-compact at {pct}% — /compact to trigger manually]
        </Text>
      )}

      <Text> </Text>

      {entries.length === 0 ? (
        <Text dimColor>(no context entries)</Text>
      ) : (
        entries.map((e) => (
          <Text key={e.id}>
            [{e.addedBy}] {e.path ?? `[${e.type}]`} ({e.tokens} tok)
          </Text>
        ))
      )}
    </Box>
  );
}
