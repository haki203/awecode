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
import { streamText, jsonSchema, type ModelMessage, type ToolSet } from 'ai';
import { createProvider } from '@awecode/llm';
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

/**
 * Vercel AI SDK v6 renames the legacy `parameters` field on a tool to
 * `inputSchema` and types tool registries as `ToolSet`
 * (`Record<string, Tool<...>>`). `ToolDefinition` (from `@awecode/tools`)
 * already carries a JSON-Schema-shaped `parameters` record, so we lift each
 * definition into the SDK's `{ description, inputSchema }` shape and accumulate
 * them into a `ToolSet`. The cast is confined to this single helper — callers
 * pass concrete `ToolDefinition` objects and get back a typed `ToolSet`, so the
 * registry never sees `any` (mirrors the `adaptToolHandler` pattern from
 * `@awecode/tools`).
 *
 * Since AI SDK v6, raw JSON Schema objects passed to `inputSchema` are no
 * longer accepted directly — they must be wrapped with the `jsonSchema()`
 * helper from the `ai` package. Without the wrapper, the SDK's internal
 * `asSchema()` tries to call `.schema()` on the plain object and fails with
 * `TypeError: schema is not a function`. See:
 *   https://ai-sdk.dev/docs/reference/ai-sdk-core/json-schema
 *   https://github.com/vercel/ai/issues/13460
 */
function buildToolSet(
  defs: ReturnType<typeof listToolDefinitions>,
): ToolSet {
  const acc: Record<string, { description: string; inputSchema: unknown }> = {};
  for (const def of defs) {
    acc[def.name] = {
      description: def.description,
      inputSchema: jsonSchema(def.parameters),
    };
  }
  return acc as ToolSet;
}

/**
 * Normalises a tool call coming back from `streamText` into the
 * `{ name, arguments, id }` shape `dispatchTool` expects.
 *
 * AI SDK v6 types tool calls as `TypedToolCall` and carries the model-supplied
 * payload on an `input` field. The brief (and our test mock) use the older
 * `args` spelling, so we read whichever field is present. `toolName` is the
 * SDK's name for the tool identifier in both v5 and v6.
 *
 * `id` preserves the provider-assigned `toolCallId` (v6 `BaseToolCall`).
 * Real providers (OpenAI, Anthropic) require the exact id they emitted for
 * tool-result correlation; when absent (e.g. our mock test), callers fall
 * back to a synthetic id built from the iteration index and tool name.
 */
interface NormalizedToolCall {
  name: string;
  arguments: Record<string, unknown>;
  id?: string;
}

function normalizeToolCall(call: {
  toolName: string;
  input?: unknown;
  args?: unknown;
  toolCallId?: string;
}): NormalizedToolCall {
  const raw = ('input' in call && call.input !== undefined)
    ? call.input
    : call.args;
  const args =
    raw !== null && typeof raw === 'object'
      ? (raw as Record<string, unknown>)
      : {};
  return { name: call.toolName, arguments: args, id: call.toolCallId };
}

export async function runChatLoop(
  messages: ModelMessage[],
  opts: ChatLoopOptions,
): Promise<ModelMessage[]> {
  try {
    const providerConfig = opts.config.providers[opts.config.activeProvider];
    if (!providerConfig) {
      throw new Error(
        `Active provider "${opts.config.activeProvider}" not found in config`,
      );
    }
    const model = createProvider(providerConfig, opts.modelOverride);

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

      // NOTE: real AI SDK v6 `streamText` returns a `StreamTextResult` directly
      // (not a Promise). The brief's test mock, however, uses
      // `mockResolvedValueOnce`, so the call yields a Promise. Awaiting a
      // non-thenable returns the value itself, so `await` works for both the real
      // API and the Promise-returning mock without diverging code paths.
      const result = await streamText({
        model,
        messages,
        system: opts.systemPrompt ?? SYSTEM_PROMPT,
        tools,
        maxOutputTokens: 4096,
        abortSignal: opts.abortSignal,
      });

      let assistantText = '';
      for await (const chunk of result.textStream) {
        assistantText += chunk;
        opts.onToken?.(chunk);
      }

      // Read toolCalls early so the empty-output guard can distinguish a
      // truly-empty stream (silent failure) from a legitimate tool-only
      // turn where the model emits no text and jumps straight to a tool
      // call. Resolving `toolCalls` before the guard is safe — the SDK's
      // promise only settles after the stream ends.
      const toolCalls = await result.toolCalls;

      // Detect an empty stream: the provider returned no assistant text AND
      // no tool calls. This is the silent-failure root cause — without the
      // throw, the loop would `break` cleanly at the empty-toolCalls check
      // below and callers would see a normal "agent done" exit with no UI
      // output, forcing the user to re-prompt multiple times before any
      // error surfaced. Throw a stable, repo-owned message rather than
      // passing through any SDK-internal text so callers can match on it
      // deterministically.
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
        const normalized = normalizeToolCall(call);
        opts.onToolCall?.(normalized.name, normalized.arguments);
        const toolResult = await dispatchTool({
          name: normalized.name,
          arguments: normalized.arguments,
        });
        opts.onToolResult?.(normalized.name, toolResult);
        const toolResultStr = JSON.stringify(toolResult);
        opts.context.addToolResult({
          toolName: normalized.name,
          content: toolResultStr,
        });
        fireContextUpdate();
        // AI SDK v6 models a tool message as `ToolModelMessage` whose content is
        // an array of `ToolResultPart` entries (not a bare string). Each part's
        // `output` is a `ToolResultOutput` discriminated union; we serialise the
        // awecode `ToolResult` into a `text`-shaped output so the structured
        // success/error payload round-trips to the model as JSON-encoded text.
        // Prefer the provider-assigned `toolCallId` (required by OpenAI /
        // Anthropic for correlation); fall back to a synthetic id for the mock
        // test which doesn't supply one.
        const toolCallId = normalized.id ?? `call-${iter}-${normalized.name}`;
        messages.push({
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId,
              toolName: normalized.name,
              output: { type: 'text', value: toolResultStr },
            },
          ],
        });
      }
    }

    return messages;
  } finally {
    opts.onDone?.();
  }
}
