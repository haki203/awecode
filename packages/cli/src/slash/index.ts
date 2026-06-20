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

export interface SlashCommand {
  name: string;
  description: string;
  handler: (args: string[], ctx: SlashContext) => Promise<void>;
}

export interface SlashContext {
  projectRoot: string;
  userSkillsDir: string;
}

const commands = new Map<string, SlashCommand>();

export function registerSlashCommand(cmd: SlashCommand): void {
  commands.set(cmd.name, cmd);
}

export function getSlashCommand(name: string): SlashCommand | undefined {
  return commands.get(name);
}

export function listSlashCommands(): SlashCommand[] {
  return [...commands.values()];
}

/**
 * Try to dispatch a slash command from user input.
 * Returns true if input was a slash command (handled or unknown),
 * false if input was not a slash command.
 */
export async function dispatchSlash(
  input: string,
  ctx: SlashContext,
): Promise<boolean> {
  if (!input.startsWith('/')) return false;

  const trimmed = input.slice(1);
  const spaceIdx = trimmed.indexOf(' ');
  const name = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const argsStr = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1);
  const args = argsStr.split(' ').filter((s) => s.length > 0);

  const cmd = commands.get(name);
  if (!cmd) {
    console.error(
      `Unknown slash command: /${name}. Available: ${[...commands.keys()].join(', ')}`,
    );
    return true;
  }

  await cmd.handler(args, ctx);
  return true;
}
