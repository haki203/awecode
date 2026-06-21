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

import { useEffect, useState } from 'react';
import { Text } from 'ink';
import { colors, spinnerFrames } from '../theme.js';

interface Props {
  label?: string;
  intervalMs?: number;
}

/**
 * Braille spinner like Codex / Claude Code. Each tick advances the frame,
 * triggering a 1-cell differential repaint in Ink — cheap and smooth.
 */
export function Spinner({ label, intervalMs = 80 }: Props) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % spinnerFrames.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return (
    <Text color={colors.accent}>
      {spinnerFrames[frame]}
      {label ? ` ${label}` : ''}
    </Text>
  );
}
