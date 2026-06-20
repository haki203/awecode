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
    expect(frame).toContain('You: hello');
    expect(frame).toContain('Agent: hi there');
  });

  it('shows thinking indicator when streaming', () => {
    const { lastFrame } = render(<ChatView messages={[]} isStreaming={true} />);
    expect(lastFrame()).toContain('thinking');
  });

  it('renders tool messages with the [tool] prefix', () => {
    const { lastFrame } = render(
      <ChatView messages={[{ role: 'tool', content: 'ran lint' }]} isStreaming={false} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[tool]');
    expect(frame).toContain('ran lint');
  });

  it('truncates tool messages longer than 200 chars', () => {
    // Use newlines so each segment stays under ink's wrap width and the
    // trailing content (chars 201+) never appears in the rendered frame.
    const chunk = 'abcdefgh'.repeat(10); // 80 chars per line, < 80-col wrap
    const long = [chunk, chunk, chunk, chunk].join('\n'); // 4 * 80 = 320 chars
    const { lastFrame } = render(
      <ChatView messages={[{ role: 'tool', content: long }]} isStreaming={false} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[tool]');
    // First three 80-char chunks are within the first 200 chars → present.
    expect(frame).toContain(chunk);
    // The 4th chunk starts at char offset 240 (3*80 + 3 newlines = 243) →
    // beyond the 200-char truncation, must NOT appear.
    expect(frame.split(chunk).length).toBeLessThanOrEqual(4);
  });

  it('shows workflow indicator when provided', () => {
    const { lastFrame } = render(
      <ChatView
        messages={[]}
        isStreaming={false}
        workflowIndicator={{ name: 'brainstorm', phase: 'round 1' }}
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
