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
import { TokenBar } from '../../src/components/TokenBar.js';

describe('TokenBar', () => {
  it('renders utilization percentage', () => {
    const { lastFrame } = render(<TokenBar used={5000} budget={10000} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('5,000');
    expect(frame).toContain('10,000');
    expect(frame).toContain('50%');
  });

  it('shows OK level when below 85%', () => {
    const { lastFrame } = render(<TokenBar used={1000} budget={10000} />);
    expect(lastFrame() ?? '').toContain('OK');
  });

  it('shows MODERATE level at 85%+', () => {
    const { lastFrame } = render(<TokenBar used={8600} budget={10000} />);
    expect(lastFrame() ?? '').toContain('MODERATE');
  });

  it('shows SEVERE level at 95%+', () => {
    const { lastFrame } = render(<TokenBar used={9600} budget={10000} />);
    expect(lastFrame() ?? '').toContain('SEVERE');
  });
});
