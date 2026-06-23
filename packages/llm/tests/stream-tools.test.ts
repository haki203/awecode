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

// Mock 'ai' with a controllable streamText so we can assert on the behaviour
// of streamChatWithTools without a real provider.
const mockStreamText = vi.fn();
vi.mock('ai', () => ({
  streamText: (...args: unknown[]) => mockStreamText(...args),
  jsonSchema: (s: unknown) => s,
}));

import { streamChatWithTools } from '../src/stream-tools.js';
import type { AwecodeConfig } from '../src/types.js';

const mockConfig: AwecodeConfig = {
  activeProvider: 'mock',
  providers: {
    mock: {
      type: 'ollama' as const,
      baseURL: 'http://localhost:11434',
      defaultModel: 'mock-model',
    },
  },
};

function makeStreamResponse(text: string, toolCalls: unknown[] = []) {
  return {
    textStream: (async function* () {
      for (const ch of text) yield ch;
    })(),
    toolCalls: Promise.resolve(toolCalls),
  };
}

describe('streamChatWithTools', () => {
  it('fires onToken for each chunk and returns accumulated text via toCompletion', async () => {
    mockStreamText.mockResolvedValueOnce(makeStreamResponse('Hi!'));
    const tokens: string[] = [];
    const result = await streamChatWithTools({
      config: mockConfig,
      messages: [{ role: 'user', content: 'hi' }],
      tools: {},
      system: 'sys',
      onToken: (c) => tokens.push(c),
    });
    const { assistantText, toolCalls } = await result.toCompletion();
    expect(tokens.join('')).toBe('Hi!');
    expect(assistantText).toBe('Hi!');
    expect(toolCalls).toEqual([]);
  });

  it('normalizes tool calls via normalizeToolCall', async () => {
    mockStreamText.mockResolvedValueOnce(
      makeStreamResponse('', [
        { toolName: 'read_file', input: { path: '/x' }, toolCallId: 'c1' },
      ]),
    );
    const result = await streamChatWithTools({
      config: mockConfig,
      messages: [{ role: 'user', content: 'hi' }],
      tools: {},
      system: 'sys',
    });
    const { toolCalls } = await result.toCompletion();
    expect(toolCalls).toEqual([
      { name: 'read_file', arguments: { path: '/x' }, id: 'c1' },
    ]);
  });

  it('throws when active provider is missing', async () => {
    const badConfig: AwecodeConfig = {
      activeProvider: 'missing',
      providers: {},
    };
    await expect(
      streamChatWithTools({
        config: badConfig,
        messages: [],
        tools: {},
        system: 'sys',
      }),
    ).rejects.toThrow(/Active provider "missing"/);
  });

  it('throws on toCompletion re-entry (stream-share footguard)', async () => {
    mockStreamText.mockResolvedValueOnce(makeStreamResponse('Hi!'));
    const result = await streamChatWithTools({
      config: mockConfig,
      messages: [{ role: 'user', content: 'hi' }],
      tools: {},
      system: 'sys',
    });
    await result.toCompletion();
    await expect(result.toCompletion()).rejects.toThrow(
      /already called/,
    );
  });
});
