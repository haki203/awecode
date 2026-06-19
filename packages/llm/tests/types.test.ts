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
