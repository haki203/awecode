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
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { ApprovalView } from '../../src/components/ApprovalView.js';
import type { ApprovalRequest, ApprovalDecision } from '@awecode/agent';

const mockRequest: ApprovalRequest = {
  id: 'approval-1',
  filePath: 'src/foo.ts',
  parsedDiff: {
    filePath: 'src/foo.ts',
    blocks: [{ search: 'old\n', replace: 'new\n' }],
  },
};

describe('ApprovalView', () => {
  it('renders file path and diff content', () => {
    const onDecision = vi.fn();
    const { lastFrame } = render(
      <ApprovalView request={mockRequest} blockIndex={0} onDecision={onDecision} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Diff Approval');
    expect(frame).toContain('src/foo.ts');
    expect(frame).toContain('old');
    expect(frame).toContain('new');
  });

  it('shows action keys y/n/s (edit hint hidden until implemented)', () => {
    const onDecision = vi.fn();
    const { lastFrame } = render(
      <ApprovalView request={mockRequest} blockIndex={0} onDecision={onDecision} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[y]');
    expect(frame).toContain('[n]');
    expect(frame).toContain('[s]');
    // [e] edit was removed from the TUI (ApprovalDecision type still allows
    // 'edit' for future use), so the hint must not be rendered.
    expect(frame).not.toContain('[e]');
  });

  it('renders Block N/M indicator from the embedded DiffPreview', () => {
    const onDecision = vi.fn();
    const { lastFrame } = render(
      <ApprovalView request={mockRequest} blockIndex={0} onDecision={onDecision} />,
    );
    expect(lastFrame() ?? '').toContain('Block 1/1');
  });

  it.each<[string, ApprovalDecision]>([
    ['y', 'accept'],
    ['n', 'reject'],
    ['s', 'skip'],
  ])('fires onDecision(%s) → %s on keypress', (key, expected) => {
    const onDecision = vi.fn();
    const { stdin } = render(
      <ApprovalView request={mockRequest} blockIndex={0} onDecision={onDecision} />,
    );
    stdin.write(key);
    expect(onDecision).toHaveBeenCalledWith(expected);
  });

  it('does not bind the removed [e] edit key', () => {
    const onDecision = vi.fn();
    const { stdin } = render(
      <ApprovalView request={mockRequest} blockIndex={0} onDecision={onDecision} />,
    );
    stdin.write('e');
    expect(onDecision).not.toHaveBeenCalled();
  });

  it('does not fire onDecision for unrelated keys', () => {
    const onDecision = vi.fn();
    const { stdin } = render(
      <ApprovalView request={mockRequest} blockIndex={0} onDecision={onDecision} />,
    );
    stdin.write('z');
    expect(onDecision).not.toHaveBeenCalled();
  });
});
