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

import { generateText, streamText } from 'ai';
import type { ModelMessage } from 'ai';
import type { AwecodeConfig } from './types.js';
import { createProvider } from './providers.js';

/**
 * Optional parameters accepted by {@link chat} and {@link streamChat}.
 */
export interface ChatOptions {
  /** System prompt injected ahead of the conversation. */
  systemPrompt?: string;
  /** Maximum number of tokens the model may generate. */
  maxTokens?: number;
  /** Sampling temperature. Provider-specific defaults apply when unset. */
  temperature?: number;
  /**
   * Override the provider's configured `defaultModel` for this call only.
   * Useful for the `awecode --model <name>` runtime flag without rewriting
   * the config file.
   */
  modelOverride?: string;
}

/**
 * Normalised result returned by {@link chat}. Token counts are coerced to
 * numbers: AI SDK v6 reports them as `number | undefined`, and we surface 0
 * when the provider omits a count.
 */
export interface ChatResult {
  text: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Resolves the active provider's configuration or throws a descriptive error.
 *
 * Kept shared between {@link chat} and {@link streamChat} so both entry points
 * surface an identical failure mode.
 */
export function resolveProviderConfig(config: AwecodeConfig) {
  const providerConfig = config.providers[config.activeProvider];
  if (!providerConfig) {
    throw new Error(
      `Active provider "${config.activeProvider}" not found in config`,
    );
  }
  return providerConfig;
}

/**
 * Non-streaming chat call. Wraps the AI SDK v6 `generateText` function and
 * normalises the result into {@link ChatResult}.
 *
 * In AI SDK v6 the usage fields `promptTokens` / `completionTokens` were
 * renamed to `inputTokens` / `outputTokens` (and may be `undefined`); we
 * translate back to the Awecode-public names and default missing counts to 0.
 */
export async function chat(
  config: AwecodeConfig,
  messages: ModelMessage[],
  opts: ChatOptions = {},
): Promise<ChatResult> {
  const model = createProvider(resolveProviderConfig(config), opts.modelOverride);
  const result = await generateText({
    model,
    messages,
    system: opts.systemPrompt,
    maxOutputTokens: opts.maxTokens,
    temperature: opts.temperature,
  });

  const promptTokens = result.usage.inputTokens ?? 0;
  const completionTokens = result.usage.outputTokens ?? 0;

  return {
    text: result.text,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    },
  };
}

/**
 * Streaming chat call. Wraps the AI SDK v6 `streamText` function and yields
 * text deltas as an `AsyncGenerator<string>`.
 *
 * Provider errors surface when the generator is first awaited, matching the
 * behaviour of a synchronous validation + lazy stream pattern: the active
 * provider is resolved eagerly (so a missing provider throws immediately on
 * the first `next()`), while the network request begins lazily inside the
 * generator body.
 */
export async function* streamChat(
  config: AwecodeConfig,
  messages: ModelMessage[],
  opts: ChatOptions = {},
): AsyncGenerator<string> {
  const model = createProvider(resolveProviderConfig(config), opts.modelOverride);
  const result = await streamText({
    model,
    messages,
    system: opts.systemPrompt,
    maxOutputTokens: opts.maxTokens,
    temperature: opts.temperature,
  });

  for await (const chunk of result.textStream) {
    yield chunk;
  }
}
