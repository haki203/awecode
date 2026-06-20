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
import { ContextPanel } from '../../src/components/ContextPanel.js';
import type { ContextEntry } from '@awecode/agent';

const mockEntry: ContextEntry = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  type: 'file',
  path: '/tmp/foo.ts',
  content: 'export const x = 1;',
  tokens: 10,
  addedAt: Date.now(),
  addedBy: 'user',
};

describe('ContextPanel', () => {
  it('renders entries with token count', () => {
    const { lastFrame } = render(
      <ContextPanel entries={[mockEntry]} totalTokens={10} budget={1000} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Context');
    expect(frame).toContain('/tmp/foo.ts');
    expect(frame).toContain('10');
    expect(frame).toContain('[user]');
    expect(frame).toContain('tok');
  });

  it('renders empty state with no entries', () => {
    const { lastFrame } = render(
      <ContextPanel entries={[]} totalTokens={0} budget={1000} />,
    );
    expect(lastFrame() ?? '').toContain('Context');
  });

  it('renders the budget progress bar characters', () => {
    const { lastFrame } = render(
      <ContextPanel entries={[]} totalTokens={500} budget={1000} />,
    );
    const frame = lastFrame() ?? '';
    // 50% fill → 10 filled cells of 20
    expect(frame).toContain('█');
    expect(frame).toContain('░');
  });

  it('falls back to [type] when path is absent', () => {
    const noPath: ContextEntry = {
      ...mockEntry,
      id: '123e4567-e89b-12d3-a456-426614174001',
      type: 'command-output',
      path: undefined,
    };
    const { lastFrame } = render(
      <ContextPanel entries={[noPath]} totalTokens={5} budget={1000} />,
    );
    expect(lastFrame() ?? '').toContain('[command-output]');
  });
});
