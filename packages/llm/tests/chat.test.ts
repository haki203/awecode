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
import { chat, streamChat } from '../src/chat.js';
import type { AwecodeConfig } from '../src/types.js';

// AI SDK v6 renames CoreMessage -> ModelMessage and
// LanguageModelUsage.{promptTokens -> inputTokens,
// completionTokens -> outputTokens}. The mock below reflects the v6 shape.
vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({
    text: 'Hello from LLM',
    usage: {
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    },
  }),
  streamText: vi.fn().mockResolvedValue({
    textStream: (async function* () {
      yield 'Hel';
      yield 'lo';
      yield ' stream';
    })(),
  }),
}));

const mockConfig: AwecodeConfig = {
  activeProvider: 'ollama',
  providers: {
    ollama: {
      type: 'ollama',
      baseURL: 'http://localhost:11434',
      defaultModel: 'llama3',
    },
  },
};

describe('chat', () => {
  it('returns text response and token usage', async () => {
    const result = await chat(mockConfig, [{ role: 'user', content: 'hi' }]);

    expect(result.text).toBe('Hello from LLM');
    expect(result.usage.promptTokens).toBe(10);
    expect(result.usage.completionTokens).toBe(5);
    expect(result.usage.totalTokens).toBe(15);
  });

  it('forwards chat options', async () => {
    const { generateText } = await import('ai');
    await chat(
      mockConfig,
      [{ role: 'user', content: 'hi' }],
      {
        systemPrompt: 'be brief',
        maxTokens: 128,
        temperature: 0.5,
      },
    );

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: 'be brief',
        maxOutputTokens: 128,
        temperature: 0.5,
      }),
    );
  });

  it('throws when active provider is missing', async () => {
    const badConfig: AwecodeConfig = {
      activeProvider: 'missing',
      providers: {},
    };
    await expect(
      chat(badConfig, [{ role: 'user', content: 'hi' }]),
    ).rejects.toThrow(/Active provider "missing"/);
  });
});

describe('streamChat', () => {
  it('yields streamed text chunks', async () => {
    const chunks: string[] = [];
    for await (const chunk of streamChat(mockConfig, [
      { role: 'user', content: 'hi' },
    ])) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['Hel', 'lo', ' stream']);
    expect(chunks.join('')).toBe('Hello stream');
  });

  it('throws when active provider is missing', async () => {
    const badConfig: AwecodeConfig = {
      activeProvider: 'missing',
      providers: {},
    };
    await expect(async () => {
      for await (const _ of streamChat(badConfig, [
        { role: 'user', content: 'hi' },
      ])) {
        // drain
      }
    }).rejects.toThrow(/Active provider "missing"/);
  });
});
