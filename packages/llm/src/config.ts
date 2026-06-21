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

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { parse, stringify } from 'yaml';
import type {
  AwecodeConfig,
  ProviderConfig,
  AnthropicProviderConfig,
  OpenAIProviderConfig,
  GoogleProviderConfig,
  OpenAICompatibleProviderConfig,
} from './types.js';
import { DEFAULT_ENV_KEYS } from './types.js';

export async function loadConfig(configPath: string): Promise<AwecodeConfig | null> {
  try {
    const content = await readFile(configPath, 'utf-8');
    const parsed = parse(content) as AwecodeConfig | null;
    if (parsed === null) return null;
    return resolveEnvKeys(parsed);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

export async function saveConfig(configPath: string, config: AwecodeConfig): Promise<void> {
  await mkdir(dirname(configPath), { recursive: true });
  const yaml = stringify(config);
  await writeFile(configPath, yaml, 'utf-8');
}

export function getDefaultConfigPath(): string {
  const home = homedir();
  return join(home, '.config', 'awecode', 'config.yaml');
}

/**
 * Returns the API key for a provider, resolving `envKey` first, then the
 * inline `apiKey` field, then the provider's conventional default env
 * var (e.g. `OPENAI_API_KEY`). Throws a descriptive error when none
 * resolve so the caller can surface a clear message to the user.
 *
 * Exported for `createProvider` and tests.
 */
export function resolveApiKey(
  providerId: string,
  cfg: ProviderConfig,
): string | undefined {
  // Ollama doesn't use API keys.
  if (cfg.type === 'ollama') return undefined;

  // Explicit envKey wins. Lets users temporarily override a file-stored
  // key without editing the file.
  if ('envKey' in cfg && cfg.envKey) {
    const fromEnv = process.env[cfg.envKey];
    if (fromEnv && fromEnv.trim() !== '') return fromEnv;
    // envKey declared but env var missing/empty — fall through to inline
    // apiKey, then the provider's conventional default.
  }

  // Inline apiKey from the YAML file.
  if ('apiKey' in cfg && cfg.apiKey && cfg.apiKey.trim() !== '') {
    return cfg.apiKey;
  }

  // Conventional default env var (OPENAI_API_KEY, ANTHROPIC_API_KEY, ...)
  // so users who already export them don't need to set anything in YAML.
  const defaultEnvKey = DEFAULT_ENV_KEYS[cfg.type];
  if (defaultEnvKey) {
    const fromDefaultEnv = process.env[defaultEnvKey];
    if (fromDefaultEnv && fromDefaultEnv.trim() !== '') return fromDefaultEnv;
  }

  return undefined;
}

/**
 * Post-load resolver. For each provider config that carries an `envKey`,
 * copies the resolved env value onto `apiKey` so downstream consumers
 * (createProvider, chat, streamChat) see a populated `apiKey` and don't
 * need to duplicate the resolution logic.
 *
 * We don't mutate the env var; we just normalise the in-memory config so
 * the rest of the codebase can treat `apiKey` as always-present-or-undefined.
 */
function resolveEnvKeys(config: AwecodeConfig): AwecodeConfig {
  const resolved: AwecodeConfig = {
    activeProvider: config.activeProvider,
    providers: {},
  };

  for (const [id, cfg] of Object.entries(config.providers)) {
    resolved.providers[id] = normalizeProvider(id, cfg);
  }

  return resolved;
}

function normalizeProvider(id: string, cfg: ProviderConfig): ProviderConfig {
  const apiKey = resolveApiKey(id, cfg);
  switch (cfg.type) {
    case 'anthropic':
      return { ...cfg, apiKey } as AnthropicProviderConfig;
    case 'openai':
      return { ...cfg, apiKey } as OpenAIProviderConfig;
    case 'google':
      return { ...cfg, apiKey } as GoogleProviderConfig;
    case 'openai-compatible':
      return { ...cfg, apiKey } as OpenAICompatibleProviderConfig;
    case 'ollama':
      // Ollama has no apiKey.
      return cfg;
  }
}
