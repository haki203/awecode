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
import { createProvider } from '../src/providers.js';
import type {
  AnthropicProviderConfig,
  OllamaProviderConfig,
  OpenAICompatibleProviderConfig,
} from '../src/types.js';

describe('createProvider', () => {
  it('creates anthropic provider', () => {
    const cfg: AnthropicProviderConfig = {
      type: 'anthropic',
      apiKey: 'sk-test',
      defaultModel: 'claude-3-5-sonnet',
    };
    const provider = createProvider(cfg);
    expect(provider).toBeDefined();
    expect(typeof provider.doGenerate).toBe('function');
  });

  it('creates ollama provider', () => {
    const cfg: OllamaProviderConfig = {
      type: 'ollama',
      baseURL: 'http://localhost:11434',
      defaultModel: 'llama3',
    };
    const provider = createProvider(cfg);
    expect(provider).toBeDefined();
  });

  it('creates openai-compatible provider with custom baseURL', () => {
    const cfg: OpenAICompatibleProviderConfig = {
      type: 'openai-compatible',
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: 'sk-or-test',
      defaultModel: 'anthropic/claude-3.5-sonnet',
    };
    const provider = createProvider(cfg);
    expect(provider).toBeDefined();
  });
});
