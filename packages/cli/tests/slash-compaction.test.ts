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
import { registerCompactionSlashCommands } from '../src/slash/compaction.js';
import { getSlashCommand, type SlashContext } from '../src/slash/index.js';

const ctx: SlashContext = {
  projectRoot: '/tmp',
  userSkillsDir: '/tmp/user',
};

describe('compaction slash commands', () => {
  it('registers 4 commands', () => {
    registerCompactionSlashCommands();
    expect(getSlashCommand('compact')).toBeDefined();
    expect(getSlashCommand('smol')).toBeDefined();
    expect(getSlashCommand('condense')).toBeDefined();
    expect(getSlashCommand('tokens')).toBeDefined();
    expect(getSlashCommand('checkpoint')).toBeDefined();
    expect(getSlashCommand('restore')).toBeDefined();
  });

  it('/compact is the primary command name with /smol and /condense as aliases', () => {
    registerCompactionSlashCommands();
    const primary = getSlashCommand('compact')!;
    const smol = getSlashCommand('smol')!;
    const condense = getSlashCommand('condense')!;
    expect(primary.handler).toBe(smol.handler);
    expect(primary.handler).toBe(condense.handler);
  });

  it('/tokens prints placeholder (without real context)', async () => {
    registerCompactionSlashCommands();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const cmd = getSlashCommand('tokens')!;
    await cmd.handler([], ctx);
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
