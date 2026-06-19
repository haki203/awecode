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

/**
 * Default Ollama endpoint used when no baseURL is configured.
 */
const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';

/**
 * Creates a Vercel AI SDK {@link LanguageModel} from an Awecode
 * {@link ProviderConfig}.
 *
 * Maps each provider type to its corresponding AI SDK v6 factory. API keys and
 * custom base URLs are configured on the provider instance (not on the model
 * call), per the current AI SDK v6 call pattern.
 *
 * - `anthropic`           → `createAnthropic({ apiKey })(model)`
 * - `openai`              → `createOpenAI({ apiKey })(model)`
 * - `google`              → `createGoogleGenerativeAI({ apiKey })(model)`
 * - `ollama`              → `createOllama({ baseURL })(model)`  (default
 *                          baseURL falls back to {@link DEFAULT_OLLAMA_BASE_URL})
 * - `openai-compatible`   → `createOpenAI({ baseURL, apiKey })(model)`
 */
export function createProvider(config: ProviderConfig): LanguageModel {
  switch (config.type) {
    case 'anthropic': {
      const provider = createAnthropic({ apiKey: config.apiKey });
      return provider(config.defaultModel);
    }

    case 'openai': {
      const provider = createOpenAI({ apiKey: config.apiKey });
      return provider(config.defaultModel);
    }

    case 'google': {
      const provider = createGoogleGenerativeAI({ apiKey: config.apiKey });
      return provider(config.defaultModel);
    }

    case 'ollama': {
      const provider = createOllama({
        baseURL: config.baseURL ?? DEFAULT_OLLAMA_BASE_URL,
      });
      return provider(config.defaultModel);
    }

    case 'openai-compatible': {
      const provider = createOpenAI({
        baseURL: config.baseURL,
        apiKey: config.apiKey,
      });
      return provider(config.defaultModel);
    }
  }
}
