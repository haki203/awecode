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
import { chatTestCommand } from '../src/commands/chat-test.js';

// chat-test now uses streamChat (not chat) because some OpenAI-compatible
// servers return SSE chunks even when stream:false is requested.
vi.mock('@awecode/llm', () => ({
  getDefaultConfigPath: vi.fn().mockReturnValue('/mock/config/path.yaml'),
  loadConfig: vi.fn().mockResolvedValue({
    activeProvider: 'mock',
    providers: { mock: { type: 'ollama', defaultModel: 'llama3' } },
  }),
  streamChat: vi.fn(async function* () {
    yield 'Hello';
    yield ' from';
    yield ' mock';
    yield ' LLM';
  }),
}));

describe('chatTestCommand', () => {
  it('streams hello and prints response', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await chatTestCommand();
    // The streamed text is written via process.stdout.write, not console.log.
    const chunks = stdoutWrite.mock.calls.map((c) => String(c[0])).join('');
    expect(chunks).toContain('Hello from mock LLM');
    consoleLog.mockRestore();
    stdoutWrite.mockRestore();
  });

  it('announces the active provider before streaming', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await chatTestCommand();
    expect(consoleLog).toHaveBeenCalledWith(
      expect.stringContaining('Sending "Hello" to mock...'),
    );
    consoleLog.mockRestore();
    stdoutWrite.mockRestore();
  });

  it('prints success marker at end', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await chatTestCommand();
    expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining('OK'));
    consoleLog.mockRestore();
    stdoutWrite.mockRestore();
  });
});
