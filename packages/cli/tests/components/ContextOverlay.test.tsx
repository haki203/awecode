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
import { ContextOverlay } from '../../src/components/ContextOverlay.js';
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

describe('ContextOverlay', () => {
  it('renders the token meter header', () => {
    const { lastFrame } = render(
      <ContextOverlay entries={[baseEntry]} totalTokens={10} budget={1000} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Context');
    expect(frame).toContain('10');
    expect(frame).toContain('1,000');
  });

  it('shows the compaction hint at >= 85%', () => {
    const { lastFrame } = render(
      <ContextOverlay entries={[baseEntry]} totalTokens={850} budget={1000} />,
    );
    expect(lastFrame() ?? '').toContain('auto-compact');
  });

  it('omits the compaction hint below 85%', () => {
    const { lastFrame } = render(
      <ContextOverlay entries={[baseEntry]} totalTokens={100} budget={1000} />,
    );
    expect(lastFrame() ?? '').not.toContain('auto-compact');
  });

  it('lists the path of each entry', () => {
    const { lastFrame } = render(
      <ContextOverlay entries={[baseEntry]} totalTokens={10} budget={1000} />,
    );
    expect(lastFrame() ?? '').toContain('/tmp/foo.ts');
  });

  it('shows the empty state when there are no entries', () => {
    const { lastFrame } = render(
      <ContextOverlay entries={[]} totalTokens={0} budget={1000} />,
    );
    expect(lastFrame() ?? '').toContain('no context entries');
  });

  it('falls back to [type] when path is absent', () => {
    const noPath: ContextEntry = {
      ...baseEntry,
      id: '123e4567-e89b-12d3-a456-426614174001',
      type: 'command-output',
      path: undefined,
    };
    const { lastFrame } = render(
      <ContextOverlay entries={[noPath]} totalTokens={5} budget={1000} />,
    );
    expect(lastFrame() ?? '').toContain('[command-output]');
  });

  it('windows long entry lists to maxHeight and shows an overflow hint', () => {
    const entries: ContextEntry[] = Array.from({ length: 30 }, (_, i) => ({
      ...baseEntry,
      id: `id-${i}`,
      path: `/tmp/file-${i}.ts`,
    }));
    const { lastFrame } = render(
      <ContextOverlay entries={entries} totalTokens={300} budget={10_000} maxHeight={6} />,
    );
    const frame = lastFrame() ?? '';
    // Most recent entry should always be visible.
    expect(frame).toContain('file-29.ts');
    // Older entries beyond the window should be summarized.
    expect(frame).toContain('older');
  });
});
