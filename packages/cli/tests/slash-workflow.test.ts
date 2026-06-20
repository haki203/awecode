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
import { registerWorkflowSlashCommands } from '../src/slash/workflow.js';
import { getSlashCommand, dispatchSlash, type SlashContext } from '../src/slash/index.js';

const ctx: SlashContext = {
  projectRoot: '/tmp',
  userSkillsDir: '/tmp/user-skills',
};

describe('workflow slash commands', () => {
  it('registers 5 commands', () => {
    registerWorkflowSlashCommands();
    expect(getSlashCommand('brainstorm')).toBeDefined();
    expect(getSlashCommand('spec')).toBeDefined();
    expect(getSlashCommand('grill')).toBeDefined();
    expect(getSlashCommand('plan')).toBeDefined();
    expect(getSlashCommand('skip-workflow')).toBeDefined();
  });

  it('/brainstorm dispatches startWorkflow', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await dispatchSlash('/brainstorm', ctx);
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('/skip-workflow prints confirmation', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await dispatchSlash('/skip-workflow', ctx);
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/Direct Mode/i));
    logSpy.mockRestore();
  });
});
