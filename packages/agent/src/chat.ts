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

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ModelMessage } from 'ai';
import { streamChatWithTools, buildToolSet } from '@awecode/llm';
import type { AwecodeConfig } from '@awecode/llm';
import { listToolDefinitions, dispatchTool } from '@awecode/tools';
import type { ContextManager } from './context/manager.js';
import { detectIntentFromText } from './intent.js';
import type { IntentDeclaration } from './intent.js';

export interface ChatLoopOptions {
  config: AwecodeConfig;
  context: ContextManager;
  systemPrompt?: string;
  maxIterations?: number;
  abortSignal?: AbortSignal;
  /**
   * Override the provider's configured `defaultModel` for this chat
   * invocation only. Lets `awecode --model gpt-4o` swap models without
   * editing the config file. The override is applied to every iteration
   * of this chat loop.
   */
  modelOverride?: string;
  onToken?: (chunk: string) => void;
  onToolCall?: (name: string, args: unknown) => void;
  onToolResult?: (name: string, result: unknown) => void;
  onDiffDetected?: (diff: string) => void;
  onIntentDeclared?: (intent: IntentDeclaration) => void;
  /**
   * Fired whenever a new entry is pushed into the ContextManager
   * (user-message, assistant-message, tool-result). Subscribers use this
   * to refresh context-meter UIs mid-turn — without it, statusline/overlay
   * would stay stale until `onDone` fires. The snapshot reflects the
   * ContextManager state at the moment of the callback.
   */
  onContextUpdate?: (snapshot: ContextUpdateSnapshot) => void;
  /**
   * Fired when the loop detects a recoverable error condition before it
   * throws — currently when the stream produced no assistant text. Callers
   * that prefer to react without relying on the thrown exception (e.g. the
   * protocol-session emit-on-event model) hook here. The same error is
   * always re-thrown immediately afterwards, so callers with a try/catch
   * around `runChatLoop` will also see it.
   */
  onError?: (err: Error) => void;
  /** Called exactly once when the loop exits (normally, via abort, or via throw). */
  onDone?: () => void;
}

export interface ContextUpdateSnapshot {
  totalTokens: number;
  budgetTokens: number;
  entryCount: number;
}

export const DEFAULT_SYSTEM_PROMPT = `You are awecode, a CLI coding agent.

When you need to modify files, output a diff block in this format:

file_path: <path>
<<<< SEARCH
<source code to find>
====
<replacement code>
>>>> REPLACE

For inserts (empty search), add an anchor:

file_path: <path>
at: @after: function foo
<<<< SEARCH
====
<new code>
>>>> REPLACE

Use the read_file, search_files, list_files, and shell_exec tools to explore the codebase before making changes.`;

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * Absolute path to the externalized base prompt. `prompts/` is a sibling of
 * both `src/` (dev) and `dist/` (built), so going up one level from this
 * module reaches `packages/agent/` in both layouts. Mirrors the
 * `getBuiltInSkillsDir()` pattern in @awecode/workflow.
 */
export function getSystemPromptPath(): string {
  return join(MODULE_DIR, '..', 'prompts', 'system.md');
}

function loadSystemPrompt(): string {
  try {
    return readFileSync(getSystemPromptPath(), 'utf-8').trim();
  } catch (err) {
    console.warn(
      `Could not load system prompt at ${getSystemPromptPath()}; falling back to inline DEFAULT_SYSTEM_PROMPT.`,
      err instanceof Error ? err.message : err,
    );
    return DEFAULT_SYSTEM_PROMPT;
  }
}

const SYSTEM_PROMPT = loadSystemPrompt();

export async function runChatLoop(
  messages: ModelMessage[],
  opts: ChatLoopOptions,
): Promise<ModelMessage[]> {
  try {
    // Seed the shared array with context entries (idempotent — caller may
    // pre-seed). We DON'T copy `messages` — it IS the live ref the caller owns,
    // so any external injection (e.g. from the Orchestrator) naturally appears
    // in the next iteration.
    const contextMessages = opts.context.toMessages();
    for (const m of contextMessages) {
      if (!messages.some((existing) => existing === m)) {
        messages.push(m);
      }
    }

    const tools = buildToolSet(listToolDefinitions());
    const maxIter = opts.maxIterations ?? 20;

    /**
     * Snapshot the ContextManager's meter fields and fire `onContextUpdate`.
     * Centralised so every entry-appending site guarantees the UI hears the
     * new numbers without duplicating the read logic.
     */
    const fireContextUpdate = () => {
      opts.onContextUpdate?.({
        totalTokens: opts.context.totalTokens,
        budgetTokens: opts.context.budgetTokens,
        entryCount: opts.context.entryCount,
      });
    };

    for (let iter = 0; iter < maxIter; iter++) {
      if (opts.abortSignal?.aborted) break;

      const result = await streamChatWithTools({
        config: opts.config,
        messages,
        tools,
        system: opts.systemPrompt ?? SYSTEM_PROMPT,
        maxOutputTokens: 4096,
        abortSignal: opts.abortSignal,
        modelOverride: opts.modelOverride,
        onToken: (chunk) => opts.onToken?.(chunk),
      });
      const { assistantText, toolCalls } = await result.toCompletion();

      // Detect an empty stream: the provider returned no assistant text AND
      // no tool calls. Throw a stable, repo-owned message so callers can
      // match on it deterministically.
      if (assistantText === '' && (!toolCalls || toolCalls.length === 0)) {
        const err = new Error(
          'No output generated. Check the stream for errors.',
        );
        opts.onError?.(err);
        throw err;
      }

      if (assistantText.includes('<<<< SEARCH')) {
        opts.onDiffDetected?.(assistantText);
      }

      const intent = detectIntentFromText(assistantText);
      opts.onIntentDeclared?.(intent);

      messages.push({ role: 'assistant', content: assistantText });
      // Track the assistant's reply in the ContextManager so the statusline %
      // reflects the live conversation. The first iteration also seeds the
      // user's prompt (caller does not have a hook for this), subsequent
      // iterations only add the assistant reply since the user message was
      // already tracked on iteration 0.
      if (iter === 0) {
        const firstUser = messages.find(
          (m) => m.role === 'user' && typeof m.content === 'string',
        );
        if (firstUser && typeof firstUser.content === 'string') {
          opts.context.addUserMessage(firstUser.content);
          fireContextUpdate();
        }
      }
      opts.context.addAssistantMessage(assistantText);
      fireContextUpdate();

      if (!toolCalls || toolCalls.length === 0) {
        break; // Agent done
      }

      for (const call of toolCalls) {
        opts.onToolCall?.(call.name, call.arguments);
        const toolResult = await dispatchTool({
          name: call.name,
          arguments: call.arguments,
        });
        opts.onToolResult?.(call.name, toolResult);

        // Route structured contextEntries (web/browser-snapshot/image) into
        // typed ContextEntry records so they show up in the context panel,
        // survive compaction, and round-trip through resume. Image entries
        // are additionally surfaced as a multimodal image part below.
        const toolResultStr = JSON.stringify(toolResult);
        opts.context.addToolResult({
          toolName: call.name,
          content: toolResultStr,
        });
        if (toolResult.ok && toolResult.contextEntries && toolResult.contextEntries.length > 0) {
          opts.context.addToolContextEntries(call.name, toolResult.contextEntries);
        }
        fireContextUpdate();
        // AI SDK v6 models a tool message as `ToolModelMessage` whose content is
        // an array of `ToolResultPart` entries (not a bare string). Each part's
        // `output` is a `ToolResultOutput` discriminated union; we serialise the
        // awecode `ToolResult` into a `text`-shaped output so the structured
        // success/error payload round-trips to the model as JSON-encoded text.
        // Image contextEntries get an additional `image` part so vision-capable
        // providers receive the actual pixels instead of a base64 string blob.
        const toolCallId = call.id ?? `call-${iter}-${call.name}`;
        const parts: Array<{
          type: 'tool-result';
          toolCallId: string;
          toolName: string;
          output:
            | { type: 'text'; value: string }
            | {
                type: 'content';
                value: Array<{ type: 'text'; text: string } | { type: 'image-data'; data: string; mediaType: string }>;
              };
        }> = [
          {
            type: 'tool-result',
            toolCallId,
            toolName: call.name,
            output: { type: 'text', value: toolResultStr },
          },
        ];
        if (toolResult.ok && toolResult.contextEntries) {
          for (const ce of toolResult.contextEntries) {
            if (ce.type === 'image' && ce.base64) {
              // Surface the image as a structured content part so vision-capable
              // providers (OpenAI, Anthropic, Google) receive the actual pixels
              // rather than a base64 blob embedded in text. AI SDK v6
              // ToolResultOutput discriminated union: a single tool result may
              // carry multiple output shapes, but each `output` is itself a
              // single union member — so we emit a separate `output: {type:'content'}`
              // part alongside the text output, both under the same toolCallId.
              parts.push({
                type: 'tool-result',
                toolCallId,
                toolName: call.name,
                output: {
                  type: 'content',
                  value: [
                    {
                      type: 'image-data',
                      data: ce.base64,
                      mediaType: ce.mimeType ?? 'image/jpeg',
                    },
                  ],
                },
              });
            }
          }
        }
        messages.push({ role: 'tool', content: parts });
      }
    }

    return messages;
  } finally {
    opts.onDone?.();
  }
}
