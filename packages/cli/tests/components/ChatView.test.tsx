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
import { ChatView } from '../../src/components/ChatView.js';
import { WorkflowIndicator } from '../../src/components/WorkflowIndicator.js';

describe('ChatView', () => {
  it('renders user and assistant messages', () => {
    const { lastFrame } = render(
      <ChatView
        messages={[
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hi there' },
        ]}
        isStreaming={false}
      />,
    );
    const frame = lastFrame();
    // New Codex-style prefix glyphs (see ChatView.tsx): ❯ for user, ● for agent.
    expect(frame).toContain('❯');
    expect(frame).toContain('hello');
    expect(frame).toContain('●');
    expect(frame).toContain('hi there');
  });

  it('shows thinking indicator when streaming', () => {
    const { lastFrame } = render(<ChatView messages={[]} isStreaming={true} />);
    expect(lastFrame()).toContain('thinking');
  });

  it('renders tool messages with the ↳ glyph and dim color', () => {
    const { lastFrame } = render(
      <ChatView messages={[{ role: 'tool', content: 'ran lint' }]} isStreaming={false} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('↳');
    expect(frame).toContain('ran lint');
  });

  it('truncates tool messages longer than 80 chars', () => {
    // New ChatView truncates tool messages to 80 chars (down from 200) to keep
    // the transcript scannable — matches Codex/OpenCode density. Use a single
    // long line; truncation kicks in regardless of newlines.
    const chunk = 'abcdefgh'.repeat(10); // 80 chars
    const long = `${chunk}${chunk}${chunk}${chunk}`; // 320 chars, no newlines
    const { lastFrame } = render(
      <ChatView messages={[{ role: 'tool', content: long }]} isStreaming={false} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('↳');
    // The full first 80-char chunk is within the 77-char truncation budget
    // (with the trailing …), so part of it must appear.
    expect(frame).toContain('abcdefgh');
    // The 4th chunk (chars 240-319) must NOT appear.
    // Sanity: count occurrences — original repeats chunk 4x, truncated ≤ 1x.
    expect(frame.split(chunk).length).toBeLessThanOrEqual(2);
  });

  it('shows workflow indicator when provided', () => {
    const { lastFrame } = render(
      <ChatView
        messages={[]}
        isStreaming={false}
        workflowIndicator={<WorkflowIndicator workflow="brainstorm" phase="round 1" />}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('brainstorm');
    expect(frame).toContain('round 1');
  });

  it('omits workflow indicator when not provided', () => {
    const { lastFrame } = render(<ChatView messages={[]} isStreaming={false} />);
    expect(lastFrame() ?? '').not.toContain('Workflow');
  });
});
