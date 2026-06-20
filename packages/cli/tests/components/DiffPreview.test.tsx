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
import { DiffPreview } from '../../src/components/DiffPreview.js';
import type { DiffBlock } from '@awecode/diff';

const block: DiffBlock = {
  search: 'old line\n',
  replace: 'new line\n',
};

describe('DiffPreview', () => {
  it('renders block index and total', () => {
    const { lastFrame } = render(
      <DiffPreview block={block} blockIndex={0} totalBlocks={2} />,
    );
    expect(lastFrame() ?? '').toContain('Block 1/2');
  });

  it('renders the search line with a "- " prefix', () => {
    const { lastFrame } = render(
      <DiffPreview block={block} blockIndex={0} totalBlocks={1} />,
    );
    expect(lastFrame() ?? '').toContain('- old line');
  });

  it('renders the replace line with a "+ " prefix', () => {
    const { lastFrame } = render(
      <DiffPreview block={block} blockIndex={0} totalBlocks={1} />,
    );
    expect(lastFrame() ?? '').toContain('+ new line');
  });

  it('shows insert placeholder for empty search', () => {
    const insert: DiffBlock = { search: '   \n', replace: 'inserted\n' };
    const { lastFrame } = render(
      <DiffPreview block={insert} blockIndex={0} totalBlocks={1} />,
    );
    expect(lastFrame() ?? '').toContain('(empty — insert)');
  });

  it('renders anchor info when anchor is provided', () => {
    const anchored: DiffBlock = {
      ...block,
      anchor: { type: 'after', symbol: 'function foo()' },
    };
    const { lastFrame } = render(
      <DiffPreview block={anchored} blockIndex={0} totalBlocks={1} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('@after');
    expect(frame).toContain('function foo()');
  });
});
