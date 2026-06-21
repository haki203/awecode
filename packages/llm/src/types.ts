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
 * Shared shape for every provider config. `defaultModel` is the model name
 * the provider SDK will be invoked with (e.g. `gpt-4o-mini`,
 * `claude-3-5-sonnet`, `llama3`). Can be overridden at runtime via the
 * `--model` CLI flag without rewriting the config file.
 *
 * `contextWindow` is an optional explicit override (in tokens) of the
 * context budget the CLI should assume for this provider. When unset, the
 * budget is resolved automatically from the model name via
 * `resolveContextBudget` (see `context-window.ts`).
 */
export interface BaseProviderConfig {
  defaultModel: string;
  contextWindow?: number;
}

/**
 * Optional API-key sourcing. Instead of hardcoding `apiKey` in
 * `~/.config/awecode/config.yaml` (which risks leaking via dotfiles
 * repos), users can set `envKey: OPENAI_API_KEY` and the resolver will
 * read the key from `process.env.OPENAI_API_KEY` at load time.
 *
 * Resolution order at runtime:
 *   1. If `envKey` is set AND `process.env[envKey]` is non-empty → use it
 *   2. Else if `apiKey` is set → use it
 *   3. Else the provider call throws a descriptive error
 *
 * If both `envKey` and `apiKey` are set, `envKey` wins (this lets users
 * temporarily override a file value via env without editing the file).
 */
export interface AnthropicProviderConfig extends BaseProviderConfig {
  type: 'anthropic';
  apiKey?: string;
  envKey?: string;
}

export interface OpenAIProviderConfig extends BaseProviderConfig {
  type: 'openai';
  apiKey?: string;
  envKey?: string;
}

export interface GoogleProviderConfig extends BaseProviderConfig {
  type: 'google';
  apiKey?: string;
  envKey?: string;
}

export interface OllamaProviderConfig extends BaseProviderConfig {
  type: 'ollama';
  baseURL?: string;
}

export interface OpenAICompatibleProviderConfig extends BaseProviderConfig {
  type: 'openai-compatible';
  baseURL: string;
  apiKey?: string;
  envKey?: string;
}

export type ProviderConfig =
  | AnthropicProviderConfig
  | OpenAIProviderConfig
  | GoogleProviderConfig
  | OllamaProviderConfig
  | OpenAICompatibleProviderConfig;

export type ProviderType =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'ollama'
  | 'openai-compatible';

export interface AwecodeConfig {
  activeProvider: string;
  providers: Record<string, ProviderConfig>;
}

export interface ModelRef {
  providerId: string;
  modelName: string;
}

/**
 * Conventional env var name for each provider type when the user hasn't
 * set `envKey` explicitly. Used as a fallback so awecode "just works" for
 * users who already export `OPENAI_API_KEY` in their shell — they can
 * leave both `apiKey` and `envKey` out of the YAML entirely.
 */
export const DEFAULT_ENV_KEYS: Record<ProviderType, string | null> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  ollama: null,
  'openai-compatible': null,
};
