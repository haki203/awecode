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

import { streamText } from 'ai';
import type { ModelMessage, ToolSet } from 'ai';
import type { AwecodeConfig } from './types.js';
import { createProvider } from './providers.js';
import { resolveProviderConfig } from './chat.js';
import { normalizeToolCall, type NormalizedToolCall } from './adapter.js';

export interface StreamWithToolsOptions {
  config: AwecodeConfig;
  messages: ModelMessage[];
  tools: ToolSet;
  system: string;
  maxOutputTokens?: number;
  abortSignal?: AbortSignal;
  modelOverride?: string;
  /** Fired for each streamed text delta. Primary streaming access path. */
  onToken?: (chunk: string) => void;
}

export interface StreamWithToolsResult {
  /**
   * Low-level escape hatch for callers that want to iterate the raw token
   * stream directly. Mutually exclusive with {@link toCompletion}: both
   * read from the same underlying stream, so call only ONE of them. Most
   * callers should use {@link toCompletion} instead.
   */
  textStream: AsyncIterable<string>;
  /**
   * Drain the stream and resolve the assistant text + normalized tool calls.
   * If {@link StreamWithToolsOptions.onToken} was provided, it is invoked
   * once per chunk as the stream drains.
   */
  toCompletion(): Promise<{
    assistantText: string;
    toolCalls: NormalizedToolCall[];
  }>;
}

export async function streamChatWithTools(
  opts: StreamWithToolsOptions,
): Promise<StreamWithToolsResult> {
  const providerConfig = resolveProviderConfig(opts.config);
  const model = createProvider(providerConfig, opts.modelOverride);

  const result = await streamText({
    model,
    messages: opts.messages,
    system: opts.system,
    tools: opts.tools,
    maxOutputTokens: opts.maxOutputTokens,
    abortSignal: opts.abortSignal,
  });

  let drained = false;
  return {
    textStream: result.textStream,
    async toCompletion() {
      if (drained) {
        throw new Error(
          'streamChatWithTools: toCompletion() already called (or textStream already drained). ' +
            'The two access paths share one underlying stream; call only one.',
        );
      }
      drained = true;
      let assistantText = '';
      for await (const chunk of result.textStream) {
        assistantText += chunk;
        opts.onToken?.(chunk);
      }
      const rawToolCalls = await result.toolCalls;
      const toolCalls = (rawToolCalls ?? []).map((c) =>
        normalizeToolCall({
          toolName: (c as { toolName: string }).toolName,
          input: (c as { input?: unknown }).input,
          args: (c as { args?: unknown }).args,
          toolCallId: (c as { toolCallId?: string }).toolCallId,
        }),
      );
      return { assistantText, toolCalls };
    },
  };
}
