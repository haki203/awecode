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
import {
  registerSlashCommand,
  getSlashCommand,
  listSlashCommands,
  dispatchSlash,
  type SlashContext,
} from '../src/slash/index.js';

const ctx: SlashContext = {
  projectRoot: '/tmp',
  userSkillsDir: '/tmp/user-skills',
};

describe('slash command framework', () => {
  it('registers and retrieves command', () => {
    const cmd = {
      name: 'test-cmd',
      description: 'test',
      handler: vi.fn(),
    };
    registerSlashCommand(cmd);
    expect(getSlashCommand('test-cmd')).toBe(cmd);
  });

  it('listSlashCommands returns all', () => {
    const list = listSlashCommands();
    expect(list.length).toBeGreaterThan(0);
  });

  it('dispatchSlash returns false for non-slash input', async () => {
    const handled = await dispatchSlash('hello world', ctx);
    expect(handled).toBe(false);
  });

  it('dispatchSlash handles registered command', async () => {
    const handler = vi.fn();
    registerSlashCommand({
      name: 'greet',
      description: 'greet',
      handler,
    });
    const handled = await dispatchSlash('/greet foo bar', ctx);
    expect(handled).toBe(true);
    expect(handler).toHaveBeenCalledWith(['foo', 'bar'], ctx);
  });

  it('dispatchSlash handles unknown command', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handled = await dispatchSlash('/nonexistent', ctx);
    expect(handled).toBe(true);
    expect(errSpy).toHaveBeenCalledWith(expect.stringMatching(/Unknown slash command/));
    errSpy.mockRestore();
  });
});
