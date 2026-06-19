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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chatTestCommand } from '../src/commands/chat-test.js';

vi.mock('@awecode/llm', () => ({
  getDefaultConfigPath: vi.fn().mockReturnValue('/mock/config/path.yaml'),
  loadConfig: vi.fn().mockResolvedValue({
    activeProvider: 'mock',
    providers: { mock: { type: 'ollama', defaultModel: 'llama3' } },
  }),
  chat: vi.fn().mockResolvedValue({
    text: 'Hello from mock LLM',
    usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
  }),
}));

describe('chatTestCommand', () => {
  it('sends hello and prints response', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    await chatTestCommand();
    expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining('Hello from mock LLM'));
    consoleLog.mockRestore();
  });

  it('announces the active provider before calling chat', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    await chatTestCommand();
    expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining('Sending "Hello" to mock...'));
    consoleLog.mockRestore();
  });

  it('prints total token usage', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    await chatTestCommand();
    expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining('tokens: 10'));
    consoleLog.mockRestore();
  });
});
