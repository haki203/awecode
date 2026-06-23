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

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { ContextStatusline } from '../../src/components/ContextStatusline.js';
import type { ContextEntry } from '@awecode/agent';

const baseEntry: ContextEntry = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  type: 'file',
  path: '/tmp/foo.ts',
  content: 'export const x = 1;',
  tokens: 10,
  addedAt: Date.now(),
  addedBy: 'user',
};

describe('ContextStatusline', () => {
  it('renders a compact single-line meter with percentage', () => {
    const { lastFrame } = render(
      <ContextStatusline entries={[baseEntry]} used={500} budget={1000} />,
    );
    const frame = lastFrame() ?? '';
    // The statusline shows the label, bar, percentage, token counts, and entry summary.
    expect(frame).toContain('ctx');
    expect(frame).toContain('50%');
    // 1 file entry, no chat turns → "1 file"
    expect(frame).toContain('1 file');
    expect(frame).toContain('━'); // filled bar cells
    expect(frame).toContain('╌'); // empty bar cells
  });

  it('renders chat turns count when entries contain chat messages', () => {
    const userMsg: ContextEntry = {
      ...baseEntry,
      id: '11111111-1111-1111-1111-111111111111',
      type: 'user-message',
      path: undefined,
    };
    const aiMsg: ContextEntry = {
      ...baseEntry,
      id: '22222222-2222-2222-2222-222222222222',
      type: 'assistant-message',
      path: undefined,
    };
    const { lastFrame } = render(
      <ContextStatusline entries={[userMsg, aiMsg]} used={500} budget={1000} />,
    );
    const frame = lastFrame() ?? '';
    // 1 user-message entry counts as 1 turn
    expect(frame).toContain('1 turn');
  });

  it('formats large token counts with k suffix', () => {
    const { lastFrame } = render(
      <ContextStatusline entries={[]} used={50_000} budget={200_000} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('50k');
    expect(frame).toContain('200k');
  });

  it('shows 0% and the empty bar when budget is 0', () => {
    const { lastFrame } = render(
      <ContextStatusline entries={[]} used={0} budget={0} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('0%');
    expect(frame).toContain('╌');
    expect(frame).not.toContain('━');
  });

  it('clamps to 100% when used exceeds budget', () => {
    const { lastFrame } = render(
      <ContextStatusline entries={[]} used={1500} budget={1000} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('100%');
  });
});
