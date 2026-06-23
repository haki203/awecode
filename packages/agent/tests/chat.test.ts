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

  it('calls onDone exactly once when the loop finishes', async () => {
    mockStreamText.mockResolvedValueOnce(makeStreamResponse('Hello!'));

    const ctx = new ContextManager();
    const doneSpy = vi.fn();
    await runChatLoop(
      [{ role: 'user', content: 'hi' }],
      {
        config: mockConfig,
        context: ctx,
        onDone: doneSpy,
      },
    );

    expect(doneSpy).toHaveBeenCalledTimes(1);
  });

  it('tracks user prompt + assistant reply in ContextManager (fixes "context stuck at 0%" bug)', async () => {
    mockStreamText.mockResolvedValueOnce(makeStreamResponse('Hello world!'));

    const ctx = new ContextManager(100_000);
    await runChatLoop(
      [{ role: 'user', content: 'hi there' }],
      { config: mockConfig, context: ctx },
    );

    // 2 entries: user-message + assistant-message
    expect(ctx.entryCount).toBe(2);
    const types = ctx.snapshot().map((e) => e.type);
    expect(types).toContain('user-message');
    expect(types).toContain('assistant-message');
    // totalTokens must be > 0 now — this is the assertion that would have
    // failed before the wire-up fix (entries stayed empty → 0 / 100k = 0%).
    expect(ctx.totalTokens).toBeGreaterThan(0);
    expect(ctx.utilization).toBeGreaterThan(0);
  });

  it('tracks tool results in ContextManager when tools are invoked', async () => {
    mockStreamText.mockResolvedValueOnce(
      makeStreamResponse('', [
        { toolName: 'read_file', args: { path: '/tmp/test.ts' } },
      ]),
    );
    mockStreamText.mockResolvedValueOnce(makeStreamResponse('Done'));

    const ctx = new ContextManager(100_000);
    await runChatLoop(
      [{ role: 'user', content: 'read file' }],
      { config: mockConfig, context: ctx },
    );

    const types = ctx.snapshot().map((e) => e.type);
    expect(types).toContain('user-message');
    expect(types).toContain('assistant-message');
    expect(types).toContain('tool-result');
    expect(ctx.totalTokens).toBeGreaterThan(0);
  });

  it('fires onContextUpdate after each entry is added (mid-turn UI refresh)', async () => {
    mockStreamText.mockResolvedValueOnce(
      makeStreamResponse('', [
        { toolName: 'read_file', args: { path: '/tmp/test.ts' } },
      ]),
    );
    mockStreamText.mockResolvedValueOnce(makeStreamResponse('Done'));

    const ctx = new ContextManager(100_000);
    const snapshots: Array<{ totalTokens: number; entryCount: number }> = [];
    await runChatLoop(
      [{ role: 'user', content: 'read file' }],
      {
        config: mockConfig,
        context: ctx,
        onContextUpdate: (s) => snapshots.push({
          totalTokens: s.totalTokens,
          entryCount: s.entryCount,
        }),
      },
    );

    // Expected fire order: user-message (iter 0 only), assistant-message
    // (iter 0), tool-result (iter 0), assistant-message (iter 1).
    // So at least 4 snapshots, each strictly increasing in entryCount.
    expect(snapshots.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < snapshots.length; i++) {
      expect(snapshots[i]!.entryCount).toBeGreaterThanOrEqual(snapshots[i - 1]!.entryCount);
    }
    // Final snapshot reflects the fully-populated ContextManager.
    const last = snapshots[snapshots.length - 1]!;
    expect(last.entryCount).toBe(ctx.entryCount);
    expect(last.totalTokens).toBe(ctx.totalTokens);
  });
});
