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

/**
 * Minimal `--key value` / `--key=value` flag parser. Returns the value
 * via out-param and removes both tokens from the args array in-place so
 * the caller can treat the remainder as positional.
 *
 * We don't pull in a flag parser lib (yargs, commander) because the CLI
 * surface is tiny — only --model/--provider affect chat, everything else
 * is a bare subcommand. Keeps the bundle small.
 */
function popFlag(args: string[], ...names: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    // Long form: --model value
    if (names.includes(a) && i + 1 < args.length) {
      const v = args[i + 1]!;
      args.splice(i, 2);
      return v;
    }
    // Long form with =: --model=value
    for (const n of names) {
      if (a.startsWith(`${n}=`)) {
        const v = a.slice(n.length + 1);
        args.splice(i, 1);
        return v;
      }
    }
  }
  return undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args[0] === '--help' || args[0] === '-h') {
    console.log(`awecode - CLI Coding Agent with workflow engine

USAGE:
  awecode [prompt] [options]      Start Direct Mode chat (default)
  awecode <command> [options]

COMMANDS:
  (default)       Direct Mode chat — interactive agent TUI
  open gui        Launch the desktop GUI (Electron)
  config          Interactive LLM provider setup
  chat-test       Smoke test: send "hello" to active provider
  worktree        Manage git worktrees (list, clean)
  --version, -v   Print version
  --help, -h      Show this help

OPTIONS (only apply to the default chat command):
  --model <name>          Override the active provider's model for this session
  --provider <id>         Switch active provider by id (must exist in config)

ENVIRONMENT:
  AWECODE_CONFIG_PATH                Override config file location
  OPENAI_API_KEY                     Auto-detected when provider type is "openai"
                                     and no apiKey/envKey is set in config
  ANTHROPIC_API_KEY                  Auto-detected for "anthropic" providers
  GOOGLE_GENERATIVE_AI_API_KEY       Auto-detected for "google" providers

Config: ~/.config/awecode/config.yaml
`);
    return;
  }

  if (args[0] === '--version' || args[0] === '-v') {
    console.log('awecode 0.0.0');
    return;
  }

  if (args[0] === 'config') {
    const { configCommand } = await import('./commands/config.js');
    await configCommand();
    return;
  }

  if (args[0] === 'chat-test') {
    const { chatTestCommand } = await import('./commands/chat-test.js');
    await chatTestCommand();
    return;
  }

  if (args[0] === 'worktree') {
    const { worktreeCommand } = await import('./commands/worktree.js');
    await worktreeCommand(args.slice(1));
    return;
  }

  if (args[0] === 'open' && args[1] === 'gui') {
    const { openGuiCommand } = await import('./commands/gui.js');
    await openGuiCommand(args.slice(2));
    return;
  }

  // Default: no args, explicit "chat", or any unknown token → Direct Mode chat.
  // Unknown tokens are treated as the first prompt rather than erroring out,
  // matching the common "awecode fix the bug in foo.ts" UX.
  const model = popFlag(args, '--model', '-m');
  const provider = popFlag(args, '--provider', '-p');
  const { chatCommand } = await import('./commands/chat.js');
  // Explicit `chat` command opens an empty prompt; any other unknown token is
  // threaded as the initial user prompt.
  const initialPrompt =
    args[0] === 'chat' || args[0] === undefined ? undefined : args[0];
  await chatCommand(initialPrompt, { model, provider });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
