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

import { loadConfig, streamChat, getDefaultConfigPath } from '@awecode/llm';

/**
 * Smoke test: send "Hello" to the active provider and print the response.
 *
 * Uses streaming (`streamChat`) rather than `chat` because some
 * OpenAI-compatible servers always return SSE chunks even when
 * `stream: false` is requested, which breaks the non-streaming JSON
 * parse path. Streaming works against both well-behaved servers and
 * the streaming-only ones.
 *
 * Exits with code 1 when no config is found so callers (and shell scripts)
 * can detect the missing-config case via exit status.
 */
export async function chatTestCommand(): Promise<void> {
  const configPath = process.env.AWECODE_CONFIG_PATH ?? getDefaultConfigPath();
  const config = await loadConfig(configPath);

  if (!config) {
    console.error(`No config found at ${configPath}. Run 'awecode config' first.`);
    process.exit(1);
  }

  console.log(`Sending "Hello" to ${config.activeProvider}...\n`);
  let text = '';
  for await (const chunk of streamChat(config, [{ role: 'user', content: 'Hello' }])) {
    process.stdout.write(chunk);
    text += chunk;
  }
  console.log('\n\n✓ OK');
}
