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

import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { WizardApp } from '../src/wizard/ui.js';

describe('WizardApp', () => {
  it('renders provider selection on first screen', () => {
    const { lastFrame } = render(React.createElement(WizardApp, { onComplete: () => {} }));
    const frame = lastFrame();
    expect(frame).toBeTruthy();
    expect(frame).toContain('Choose provider');
    expect(frame).toContain('OpenAI');
    expect(frame).toContain('Anthropic');
    expect(frame).toContain('Ollama');
  });

  it('calls onComplete(null) immediately when "Skip" is selected', () => {
    const onComplete = vi.fn();
    const { stdin } = render(React.createElement(WizardApp, { onComplete }));
    // Skip is the 6th item; ink-select-input responds to number keys 1-9.
    stdin.write('\u0015'); // Ctrl-U clears any current line state (no-op here, safe)
    // Press '6' to jump to the 6th item (Skip), then Enter to select.
    stdin.write('6');
    stdin.write('\r');
    // onComplete should have been called with null on skip path.
    expect(onComplete).toHaveBeenCalledWith(null);
  });
});
