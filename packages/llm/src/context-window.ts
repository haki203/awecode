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

import type { ProviderConfig } from './types.js';

/**
 * Fallback context window (in tokens) when a model is not recognised by
 * {@link resolveContextBudget}. The CLI historically hard-coded 100k, which
 * badly understated modern frontier models (most now ship 200k–2M). 1M is a
 * safe middle ground that avoids spurious auto-compact triggers on unknown
 * models while still surfacing real usage on the status bar.
 */
export const DEFAULT_CONTEXT_WINDOW_FALLBACK = 1_000_000;

/**
 * Maximum input context window (tokens) for a known model pattern.
 *
 * Values reflect the **input** budget the provider will accept, not the
 * combined input+output marketing figure. For example GPT-5's "400k context"
 * is really 272k input + 128k output, so we store 272k here — that is what
 * the agent can actually put in its messages array before the provider
 * rejects the request.
 *
 * Patterns are matched as case-insensitive substrings against the model name
 * after stripping any `provider/` prefix (e.g. `glm/glm-5.2` → `glm-5.2`).
 * The longest matching pattern wins so `glm-5.2` beats `glm-5` beats `glm`.
 *
 * Sources: Anthropic / OpenAI / Google / Zhipu / DeepSeek / Qwen / Mistral
 * / Meta official docs as of June 2026.
 */
const MODEL_CONTEXT_WINDOWS: ReadonlyArray<{ pattern: string; tokens: number }> =
  [
    // ---- Anthropic Claude ----
    // 4.6 generation ships 1M context GA at standard pricing.
    { pattern: 'claude-opus-4-6', tokens: 1_000_000 },
    { pattern: 'claude-opus-4.6', tokens: 1_000_000 },
    { pattern: 'claude-sonnet-4-6', tokens: 1_000_000 },
    { pattern: 'claude-sonnet-4.6', tokens: 1_000_000 },
    // 4 / 4.1 / 4.5 generation: 200k standard (1M needs beta header and a
    // pricing premium, so we report the conservative 200k figure).
    { pattern: 'claude-opus-4', tokens: 200_000 },
    { pattern: 'claude-sonnet-4', tokens: 200_000 },
    { pattern: 'claude-haiku-4', tokens: 200_000 },
    { pattern: 'claude-3-5', tokens: 200_000 },
    { pattern: 'claude-3.5', tokens: 200_000 },
    { pattern: 'claude-3', tokens: 200_000 },

    // ---- OpenAI ----
    // GPT-5 / 5.1: 272k input (400k total − 128k reserved for output).
    { pattern: 'gpt-5', tokens: 272_000 },
    // GPT-4.1: 1M input.
    { pattern: 'gpt-4.1', tokens: 1_000_000 },
    // GPT-4o family: 128k.
    { pattern: 'gpt-4o', tokens: 128_000 },
    { pattern: 'gpt-4-turbo', tokens: 128_000 },
    { pattern: 'gpt-4-', tokens: 128_000 },
    // o-series reasoning models: 200k.
    { pattern: 'o3', tokens: 200_000 },
    { pattern: 'o4', tokens: 200_000 },
    { pattern: 'o1', tokens: 200_000 },

    // ---- Google Gemini ----
    { pattern: 'gemini-2.5-pro', tokens: 2_000_000 },
    { pattern: 'gemini-2.5-flash', tokens: 1_000_000 },
    { pattern: 'gemini-2.0', tokens: 1_000_000 },
    { pattern: 'gemini-1.5-pro', tokens: 2_000_000 },
    { pattern: 'gemini-1.5-flash', tokens: 1_000_000 },
    { pattern: 'gemini', tokens: 1_000_000 },

    // ---- Zhipu GLM ----
    // GLM-5.2: 1M input (the [1m] variant is explicit, default also 1M).
    { pattern: 'glm-5.2', tokens: 1_000_000 },
    // GLM-5 / 5.1: 200k input.
    { pattern: 'glm-5', tokens: 200_000 },
    // GLM-4.6: 200k input.
    { pattern: 'glm-4.6', tokens: 200_000 },
    // GLM-4.5 / 4.5-Air: 128k.
    { pattern: 'glm-4.5', tokens: 128_000 },
    { pattern: 'glm-4-air', tokens: 128_000 },
    { pattern: 'glm-4', tokens: 128_000 },

    // ---- DeepSeek ----
    { pattern: 'deepseek-v3', tokens: 128_000 },
    { pattern: 'deepseek-r1', tokens: 128_000 },
    { pattern: 'deepseek', tokens: 128_000 },

    // ---- Qwen ----
    { pattern: 'qwen3', tokens: 128_000 },
    { pattern: 'qwen2.5', tokens: 128_000 },
    { pattern: 'qwen', tokens: 128_000 },

    // ---- Mistral ----
    { pattern: 'codestral', tokens: 256_000 },
    { pattern: 'mistral-large', tokens: 128_000 },
    { pattern: 'mistral', tokens: 128_000 },

    // ---- Meta Llama ----
    { pattern: 'llama-4-scout', tokens: 10_000_000 },
    { pattern: 'llama-4-maverick', tokens: 1_000_000 },
    { pattern: 'llama-4', tokens: 1_000_000 },
    { pattern: 'llama-3.3', tokens: 128_000 },
    { pattern: 'llama-3.1', tokens: 128_000 },
    { pattern: 'llama', tokens: 128_000 },

    // ---- xAI Grok ----
    { pattern: 'grok-4', tokens: 2_000_000 },
    { pattern: 'grok-3', tokens: 1_000_000 },
    { pattern: 'grok', tokens: 1_000_000 },
  ];

/**
 * Strips a leading `provider/` prefix from a model identifier.
 *
 * OpenAI-compatible routers (OpenRouter, Z.ai, etc.) frequently namespace
 * models as `glm/glm-5.2`, `anthropic/claude-sonnet-4`, etc. The lookup
 * table keys on the bare model name, so we normalise first.
 */
function stripProviderPrefix(modelName: string): string {
  const slash = modelName.lastIndexOf('/');
  return slash >= 0 ? modelName.slice(slash + 1) : modelName;
}

/**
 * Resolves the input context budget (in tokens) for a model by looking it
 * up in {@link MODEL_CONTEXT_WINDOWS}. Returns
 * {@link DEFAULT_CONTEXT_WINDOW_FALLBACK} when no pattern matches.
 *
 * Matching is case-insensitive substring on the model name (after prefix
 * stripping), with the longest matching pattern winning — so specific
 * versions (`glm-5.2`) take precedence over their family (`glm-5`).
 *
 * @example
 *   resolveContextBudget('glm/glm-5.2')    // → 1_000_000
 *   resolveContextBudget('gpt-5')           // → 272_000
 *   resolveContextBudget('unknown-model')   // → 1_000_000 (fallback)
 */
export function resolveContextBudget(modelName: string): number {
  if (!modelName || modelName.trim() === '') {
    return DEFAULT_CONTEXT_WINDOW_FALLBACK;
  }

  const needle = stripProviderPrefix(modelName).toLowerCase();
  let best: { pattern: string; tokens: number } | null = null;

  for (const entry of MODEL_CONTEXT_WINDOWS) {
    if (needle.includes(entry.pattern)) {
      if (best === null || entry.pattern.length > best.pattern.length) {
        best = entry;
      }
    }
  }

  return best?.tokens ?? DEFAULT_CONTEXT_WINDOW_FALLBACK;
}

/**
 * Resolves the context budget for a configured provider, honouring an
 * explicit `contextWindow` override on the provider config when present.
 *
 * Resolution order:
 *   1. `cfg.contextWindow` (explicit user override in config.yaml)
 *   2. `resolveContextBudget(modelOverride ?? cfg.defaultModel)` (table)
 *   3. {@link DEFAULT_CONTEXT_WINDOW_FALLBACK} (implicit via the table)
 *
 * The `modelOverride` parameter is the runtime model swap from the
 * `awecode --model <name>` flag; when set it takes precedence over the
 * provider's configured `defaultModel` so the budget tracks the model the
 * user is actually invoking.
 */
export function resolveProviderContextWindow(
  cfg: ProviderConfig,
  modelOverride?: string,
): number {
  if (typeof cfg.contextWindow === 'number' && cfg.contextWindow > 0) {
    return cfg.contextWindow;
  }
  const model = modelOverride ?? cfg.defaultModel;
  return resolveContextBudget(model);
}
