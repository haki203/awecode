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

// After the cutover, agent imports streamChatWithTools from @awecode/llm
// (not streamText from 'ai'). Mock it with a controllable implementation.
const mockStreamChatWithTools = vi.fn();
vi.mock('@awecode/llm', async () => {
  const actual = await vi.importActual<typeof import('@awecode/llm')>('@awecode/llm');
  return {
    ...actual,
    // Faithful to the real streamChatWithTools, which fires onToken from its
    // closure as toCompletion() drains the stream. Capture onToken from the
    // call opts and re-emit per character so a streaming assertion
    // (tokens.join('') === text) keeps passing — matches chat.test.ts.
    streamChatWithTools: async (...args: unknown[]) => {
      const opts = (args[0] ?? {}) as { onToken?: (chunk: string) => void };
      const result = (await mockStreamChatWithTools(...args)) as {
        textStream: AsyncIterable<string>;
        toCompletion: () => Promise<{ assistantText: string; toolCalls: unknown[] }>;
      };
      const orig = result.toCompletion.bind(result);
      result.toCompletion = async () => {
        const out = await orig();
        for (const ch of out.assistantText) opts.onToken?.(ch);
        return out;
      };
      return result;
    },
  };
});

function makeStreamResult(text: string) {
  return {
    textStream: (async function* () {
      for (const ch of text) yield ch;
    })(),
    toCompletion: async () => ({
      assistantText: text,
      toolCalls: [],
    }),
  };
}

const mockConfig: AwecodeConfig = {
  activeProvider: 'mock',
  providers: {
    mock: { type: 'ollama', baseURL: 'http://x', defaultModel: 'm' },
  },
};

describe('chat loop Intent Declaration', () => {
  it('fires onIntentDeclared when agent emits start_workflow', async () => {
    mockStreamChatWithTools.mockResolvedValueOnce(
      makeStreamResult('I will start_workflow("brainstorm") for this task.'),
    );

    const ctx = new ContextManager();
    let declared: string | null = null;
    await runChatLoop([{ role: 'user', content: 'build X' }], {
      config: mockConfig,
      context: ctx,
      onIntentDeclared: (intent) => {
        declared = intent.type === 'workflow' ? intent.name : null;
      },
    });

    expect(declared).toBe('brainstorm');
  });

  it('fires onIntentDeclared with direct mode when no workflow', async () => {
    mockStreamChatWithTools.mockResolvedValueOnce(makeStreamResult('Fixed the typo.'));

    const ctx = new ContextManager();
    let intentType: string | null = null;
    await runChatLoop([{ role: 'user', content: 'fix typo' }], {
      config: mockConfig,
      context: ctx,
      onIntentDeclared: (intent) => {
        intentType = intent.type;
      },
    });

    expect(intentType).toBe('direct');
  });
});
