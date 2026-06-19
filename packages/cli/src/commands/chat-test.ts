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

import { loadConfig, chat, getDefaultConfigPath } from '@awecode/llm';

/**
 * Smoke test: send "Hello" to the active provider and print the response.
 *
 * Exits with code 1 when no config is found so callers (and shell scripts)
 * can detect the missing-config case via exit status.
 */
export async function chatTestCommand(): Promise<void> {
  const configPath = getDefaultConfigPath();
  const config = await loadConfig(configPath);

  if (!config) {
    console.error(`No config found at ${configPath}. Run 'awecode config' first.`);
    process.exit(1);
  }

  console.log(`Sending "Hello" to ${config.activeProvider}...`);
  const result = await chat(config, [{ role: 'user', content: 'Hello' }]);
  console.log(`\n${result.text}`);
  console.log(`\n(tokens: ${result.usage.totalTokens})`);
}
