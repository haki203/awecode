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

import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOllama } from 'ai-sdk-ollama';
import type { LanguageModel } from 'ai';
import type { ProviderConfig } from './types.js';
import { DEFAULT_ENV_KEYS } from './types.js';

/**
 * Default Ollama endpoint used when no baseURL is configured.
 */
const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';

/**
 * Creates a Vercel AI SDK {@link LanguageModel} from an Awecode
 * {@link ProviderConfig}.
 *
 * Expects `apiKey` to already be resolved onto the config (either inline
 * from the YAML, via `envKey`, or via the provider's conventional default
 * env var). Callers should go through {@link loadConfig} which performs
 * that resolution; if `apiKey` is still missing here we throw with a
 * message that tells the user exactly which env var to set.
 *
 * - `anthropic`           → `createAnthropic({ apiKey })(model)`
 * - `openai`              → `createOpenAI({ apiKey })(model)`
 * - `google`              → `createGoogleGenerativeAI({ apiKey })(model)`
 * - `ollama`              → `createOllama({ baseURL })(model)`  (default
 *                          baseURL falls back to {@link DEFAULT_OLLAMA_BASE_URL})
 * - `openai-compatible`   → `createOpenAI({ baseURL, apiKey })(model)`
 *
 * An optional `modelOverride` lets callers swap the model at runtime
 * (used by the `awecode --model <name>` flag) without mutating the
 * config file.
 */
export function createProvider(
  config: ProviderConfig,
  modelOverride?: string,
): LanguageModel {
  const model = modelOverride ?? config.defaultModel;
  if (!model) {
    throw new Error(
      `Provider "${config.type}" has no model. Set "defaultModel" in the ` +
        `config file or pass --model <name> on the command line.`,
    );
  }

  switch (config.type) {
    case 'anthropic': {
      const apiKey = requireApiKey(config.type, config.apiKey);
      const provider = createAnthropic({ apiKey });
      return provider(model);
    }

    case 'openai': {
      const apiKey = requireApiKey(config.type, config.apiKey);
      const provider = createOpenAI({ apiKey });
      return provider(model);
    }

    case 'google': {
      const apiKey = requireApiKey(config.type, config.apiKey);
      const provider = createGoogleGenerativeAI({ apiKey });
      return provider(model);
    }

    case 'ollama': {
      const provider = createOllama({
        baseURL: config.baseURL ?? DEFAULT_OLLAMA_BASE_URL,
      });
      return provider(model);
    }

    case 'openai-compatible': {
      // openai-compatible providers may or may not require a key (e.g.
      // a local LM Studio server typically doesn't). Pass `dummy` when
      // unset so the SDK constructor doesn't complain; the server will
      // reject the request if it actually needs auth.
      const apiKey = config.apiKey ?? 'dummy';
      const provider = createOpenAI({
        baseURL: config.baseURL,
        apiKey,
      });
      return provider(model);
    }
  }
}

/**
 * Throws a provider-specific, actionable error when an API key is missing.
 * Mentions both the explicit `envKey` convention and the conventional
 * default (e.g. `OPENAI_API_KEY`) so the user knows exactly what to do.
 */
function requireApiKey(
  type: 'anthropic' | 'openai' | 'google',
  apiKey: string | undefined,
): string {
  if (apiKey && apiKey.trim() !== '') return apiKey;

  const envVar = DEFAULT_ENV_KEYS[type];
  throw new Error(
    `Provider "${type}" requires an API key. Either:\n` +
      `  1. Set "${envVar}" in your shell environment, OR\n` +
      `  2. Run "awecode config" and enter the key when prompted, OR\n` +
      `  3. Add "envKey: ${envVar}" to the provider block in ` +
      `~/.config/awecode/config.yaml\n` +
      `See https://github.com/<owner>/awecode/blob/master/docs/getting-started.md.`,
  );
}
