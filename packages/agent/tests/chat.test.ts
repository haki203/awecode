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
import { runChatLoop } from '../src/chat.js';
import { ContextManager } from '../src/context/manager.js';
import type { AwecodeConfig } from '@awecode/llm';

// Mock @awecode/llm
vi.mock('@awecode/llm', () => ({
  createProvider: vi.fn(() => ({})), // opaque model object
}));

// Mock ai (Vercel AI SDK)
const mockStreamText = vi.fn();
vi.mock('ai', () => ({
  streamText: (...args: unknown[]) => mockStreamText(...args),
  // Identity wrapper so buildToolSet's jsonSchema() call returns the
  // raw schema unchanged — tests don't assert on tool schema shape.
  jsonSchema: (schema: unknown) => schema,
}));

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

describe('runChatLoop', () => {
  it('returns messages with assistant response when no tool calls', async () => {
    mockStreamText.mockResolvedValueOnce(makeStreamResponse('Hello!'));

    const ctx = new ContextManager();
    const tokens: string[] = [];
    const result = await runChatLoop(
      [{ role: 'user', content: 'hi' }],
      {
        config: mockConfig,
        context: ctx,
        onToken: (t) => tokens.push(t),
      },
    );

    expect(result).toHaveLength(2); // user + assistant
    expect(result[1]!.role).toBe('assistant');
    expect(result[1]!.content).toBe('Hello!');
    expect(tokens.join('')).toBe('Hello!');
  });

  it('detects diff markers in response', async () => {
    mockStreamText.mockResolvedValueOnce(
      makeStreamResponse('file_path: foo.ts\n<<<< SEARCH\nx\n====\ny\n>>>> REPLACE'),
    );

    const ctx = new ContextManager();
    let detectedDiff: string | null = null;
    await runChatLoop([{ role: 'user', content: 'edit' }], {
      config: mockConfig,
      context: ctx,
      onDiffDetected: (diff) => (detectedDiff = diff),
    });

    expect(detectedDiff).not.toBeNull();
    expect(detectedDiff).toContain('<<<< SEARCH');
  });

  it('invokes tool calls when present', async () => {
    // First iteration: returns tool call
    mockStreamText.mockResolvedValueOnce(
      makeStreamResponse('', [
        {
          toolName: 'read_file',
          args: { path: '/tmp/test.ts' },
        },
      ]),
    );
    // Second iteration: returns text only (done)
    mockStreamText.mockResolvedValueOnce(makeStreamResponse('Done reading file'));

    const ctx = new ContextManager();
    const toolCalls: Array<{ name: string; args: unknown }> = [];
    const toolResults: Array<{ name: string; result: unknown }> = [];

    await runChatLoop([{ role: 'user', content: 'read file' }], {
      config: mockConfig,
      context: ctx,
      onToolCall: (name, args) => toolCalls.push({ name, args }),
      onToolResult: (name, result) => toolResults.push({ name, result }),
    });

    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]!.name).toBe('read_file');
    expect(toolResults).toHaveLength(1);
  });
});
