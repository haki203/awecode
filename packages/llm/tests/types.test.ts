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

import { describe, it, expect } from 'vitest';
import type { ProviderConfig, AwecodeConfig } from '../src/types.js';

describe('ProviderConfig types', () => {
  it('accepts anthropic provider with apiKey', () => {
    const cfg: ProviderConfig = {
      type: 'anthropic',
      apiKey: 'sk-ant-xxx',
      defaultModel: 'claude-3-5-sonnet',
    };
    expect(cfg.type).toBe('anthropic');
  });

  it('accepts openai-compatible provider with baseURL', () => {
    const cfg: ProviderConfig = {
      type: 'openai-compatible',
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: 'sk-or-xxx',
      defaultModel: 'anthropic/claude-3.5-sonnet',
    };
    expect(cfg.type).toBe('openai-compatible');
  });

  it('accepts ollama provider without apiKey', () => {
    const cfg: ProviderConfig = {
      type: 'ollama',
      baseURL: 'http://localhost:11434',
      defaultModel: 'llama3',
    };
    expect(cfg.type).toBe('ollama');
  });

  it('AwecodeConfig has exactly one active provider', () => {
    const cfg: AwecodeConfig = {
      activeProvider: 'anthropic',
      providers: {
        anthropic: {
          type: 'anthropic',
          apiKey: 'sk-ant-xxx',
          defaultModel: 'claude-3-5-sonnet',
        },
      },
    };
    expect(cfg.activeProvider).toBe('anthropic');
  });
});
