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

interface Props {
  used: number;
  budget: number;
}

export function TokenBar({ used, budget }: Props) {
  const rawPct = budget > 0 ? Math.round((used / budget) * 100) : 0;
  // Clamp to [0, 100] so runaway used (> budget) doesn't break the bar
  const pct = Math.max(0, Math.min(100, rawPct));
  const level = pct >= 95 ? 'SEVERE' : pct >= 85 ? 'MODERATE' : 'OK';
  const color = pct >= 95 ? 'red' : pct >= 85 ? 'yellow' : 'green';

  const filled = Math.floor(pct / 5);
  const bar = '█'.repeat(Math.min(filled, 20)) + '░'.repeat(Math.max(0, 20 - filled));

  return (
    <Box flexDirection="column">
      <Text>
        Context ({used.toLocaleString()} / {budget.toLocaleString()} tokens) — {pct}% —{' '}
        <Text color={color} bold>{level}</Text>
      </Text>
      <Text color={color}>{bar}</Text>
    </Box>
  );
}
