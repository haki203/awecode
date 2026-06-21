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
import {
  resolveContextBudget,
  resolveProviderContextWindow,
  DEFAULT_CONTEXT_WINDOW_FALLBACK,
} from '../src/context-window.js';
import type { ProviderConfig } from '../src/types.js';

describe('resolveContextBudget', () => {
  it('resolves GLM-5.2 to 1M (the user-reported regression)', () => {
    expect(resolveContextBudget('glm/glm-5.2')).toBe(1_000_000);
    expect(resolveContextBudget('glm-5.2')).toBe(1_000_000);
    expect(resolveContextBudget('GLM-5.2')).toBe(1_000_000);
    expect(resolveContextBudget('glm-5.2[1m]')).toBe(1_000_000);
  });

  it('resolves GLM-5 / 5.1 to 200k', () => {
    expect(resolveContextBudget('glm-5')).toBe(200_000);
    expect(resolveContextBudget('glm-5.1')).toBe(200_000);
    expect(resolveContextBudget('glm/glm-5')).toBe(200_000);
  });

  it('resolves GLM-4.5 to 128k and GLM-4.6 to 200k', () => {
    expect(resolveContextBudget('glm-4.5')).toBe(128_000);
    expect(resolveContextBudget('glm-4.5-air')).toBe(128_000);
    expect(resolveContextBudget('glm-4.6')).toBe(200_000);
  });

  it('prefers the longest matching pattern (specificity)', () => {
    // glm-5.2 must win over glm-5
    expect(resolveContextBudget('glm-5.2')).toBe(1_000_000);
    expect(resolveContextBudget('glm-5.1')).toBe(200_000);
    // gpt-5 must win over gpt-4-
    expect(resolveContextBudget('gpt-5')).toBe(272_000);
    expect(resolveContextBudget('gpt-4o')).toBe(128_000);
    expect(resolveContextBudget('gpt-4.1')).toBe(1_000_000);
  });

  it('resolves Anthropic Claude models', () => {
    expect(resolveContextBudget('claude-opus-4-6')).toBe(1_000_000);
    expect(resolveContextBudget('claude-sonnet-4-6')).toBe(1_000_000);
    expect(resolveContextBudget('claude-sonnet-4-5')).toBe(200_000);
    expect(resolveContextBudget('claude-opus-4-1')).toBe(200_000);
    expect(resolveContextBudget('claude-3-5-sonnet')).toBe(200_000);
    expect(resolveContextBudget('claude-3.5-haiku')).toBe(200_000);
  });

  it('resolves OpenAI GPT models', () => {
    // 272k = 400k total − 128k reserved for output
    expect(resolveContextBudget('gpt-5')).toBe(272_000);
    expect(resolveContextBudget('gpt-5.1')).toBe(272_000);
    expect(resolveContextBudget('gpt-4.1')).toBe(1_000_000);
    expect(resolveContextBudget('gpt-4o')).toBe(128_000);
    expect(resolveContextBudget('gpt-4o-mini')).toBe(128_000);
    expect(resolveContextBudget('o3-mini')).toBe(200_000);
  });

  it('resolves Google Gemini models', () => {
    expect(resolveContextBudget('gemini-2.5-pro')).toBe(2_000_000);
    expect(resolveContextBudget('gemini-2.5-flash')).toBe(1_000_000);
    expect(resolveContextBudget('gemini-1.5-pro')).toBe(2_000_000);
  });

  it('resolves DeepSeek, Qwen, Mistral, Llama models', () => {
    expect(resolveContextBudget('deepseek-v3')).toBe(128_000);
    expect(resolveContextBudget('deepseek-r1')).toBe(128_000);
    expect(resolveContextBudget('qwen3-235b')).toBe(128_000);
    expect(resolveContextBudget('qwen2.5-coder')).toBe(128_000);
    expect(resolveContextBudget('mistral-large-2')).toBe(128_000);
    expect(resolveContextBudget('codestral-latest')).toBe(256_000);
    expect(resolveContextBudget('llama-4-scout')).toBe(10_000_000);
    expect(resolveContextBudget('llama-4-maverick')).toBe(1_000_000);
    expect(resolveContextBudget('llama-3.3-70b')).toBe(128_000);
  });

  it('is case-insensitive', () => {
    expect(resolveContextBudget('GPT-5')).toBe(272_000);
    expect(resolveContextBudget('CLAUDE-OPUS-4-6')).toBe(1_000_000);
    expect(resolveContextBudget('GEMINI-2.5-PRO')).toBe(2_000_000);
  });

  it('strips provider/ namespace prefixes', () => {
    expect(resolveContextBudget('anthropic/claude-sonnet-4-6')).toBe(
      1_000_000,
    );
    expect(resolveContextBudget('openai/gpt-5')).toBe(272_000);
    expect(resolveContextBudget('zai-org/glm-4.5')).toBe(128_000);
  });

  it('returns the fallback for unknown models', () => {
    expect(resolveContextBudget('some-unknown-model')).toBe(
      DEFAULT_CONTEXT_WINDOW_FALLBACK,
    );
    expect(resolveContextBudget('future-gpt-99')).toBe(
      DEFAULT_CONTEXT_WINDOW_FALLBACK,
    );
  });

  it('returns the fallback for empty or whitespace model names', () => {
    expect(resolveContextBudget('')).toBe(DEFAULT_CONTEXT_WINDOW_FALLBACK);
    expect(resolveContextBudget('   ')).toBe(DEFAULT_CONTEXT_WINDOW_FALLBACK);
  });
});

describe('resolveProviderContextWindow', () => {
  it('honours explicit contextWindow override on the provider config', () => {
    const cfg: ProviderConfig = {
      type: 'openai-compatible',
      baseURL: 'https://example.com/v1',
      defaultModel: 'unknown-model',
      contextWindow: 500_000,
    };
    expect(resolveProviderContextWindow(cfg)).toBe(500_000);
  });

  it('ignores non-positive contextWindow override', () => {
    const cfg: ProviderConfig = {
      type: 'openai-compatible',
      baseURL: 'https://example.com/v1',
      defaultModel: 'glm-5.2',
      contextWindow: 0,
    };
    expect(resolveProviderContextWindow(cfg)).toBe(1_000_000);
  });

  it('falls back to table lookup when no override is set', () => {
    const cfg: ProviderConfig = {
      type: 'openai-compatible',
      baseURL: 'https://example.com/v1',
      defaultModel: 'glm-5.2',
    };
    expect(resolveProviderContextWindow(cfg)).toBe(1_000_000);
  });

  it('uses modelOverride in place of defaultModel for the lookup', () => {
    const cfg: ProviderConfig = {
      type: 'openai-compatible',
      baseURL: 'https://example.com/v1',
      defaultModel: 'unknown',
    };
    expect(resolveProviderContextWindow(cfg, 'gpt-5')).toBe(272_000);
    expect(resolveProviderContextWindow(cfg, 'claude-sonnet-4-6')).toBe(
      1_000_000,
    );
  });

  it('override beats modelOverride for specificity', () => {
    // If both an explicit contextWindow and modelOverride are given, the
    // explicit override wins (the user said "I know better").
    const cfg: ProviderConfig = {
      type: 'openai',
      apiKey: 'sk-test',
      defaultModel: 'gpt-5',
      contextWindow: 123_456,
    };
    expect(resolveProviderContextWindow(cfg, 'gpt-4o')).toBe(123_456);
  });
});
