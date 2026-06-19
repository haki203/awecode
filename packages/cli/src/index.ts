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

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`awecode - CLI Coding Agent with workflow engine

USAGE:
  awecode <command> [options]

COMMANDS:
  config          Interactive LLM provider setup
  chat-test       Smoke test: send "hello" to active provider
  --version, -v   Print version
  --help, -h      Show this help

ENVIRONMENT:
  AWECODE_CONFIG_PATH   Override config file location

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

  console.error(`Unknown command: ${args[0]}. Run 'awecode --help' for usage.`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
