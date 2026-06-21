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

vi.mock('@awecode/llm', () => ({
  createProvider: vi.fn(() => ({})),
}));

const mockStreamText = vi.fn();
vi.mock('ai', () => ({
  streamText: (...args: unknown[]) => mockStreamText(...args),
  jsonSchema: (schema: unknown) => schema,
}));

const mockConfig: AwecodeConfig = {
  activeProvider: 'mock',
  providers: {
    mock: { type: 'ollama', baseURL: 'http://x', defaultModel: 'm' },
  },
};

function makeStreamResponse(text: string) {
  return {
    textStream: (async function* () {
      for (const ch of text) yield ch;
    })(),
    toolCalls: Promise.resolve([]),
  };
}

describe('chat loop Intent Declaration', () => {
  it('fires onIntentDeclared when agent emits start_workflow', async () => {
    mockStreamText.mockResolvedValueOnce(
      makeStreamResponse('I will start_workflow("brainstorm") for this task.'),
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
    mockStreamText.mockResolvedValueOnce(makeStreamResponse('Fixed the typo.'));

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
