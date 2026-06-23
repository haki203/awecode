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

import { jsonSchema, type ToolSet } from 'ai';

/**
 * Structural subset of @awecode/tools' ToolDefinition that buildToolSet reads.
 * Declared locally so @awecode/llm does not depend on @awecode/tools. The real
 * ToolDefinition satisfies this structurally (it has exactly these 3 fields),
 * so callers pass concrete definitions with no cast.
 */
export interface AdapterToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface NormalizedToolCall {
  name: string;
  arguments: Record<string, unknown>;
  id?: string;
}

/**
 * Lifts each ToolDefinition into the AI SDK v6 `{ description, inputSchema }`
 * shape and accumulates them into a `ToolSet`. AI SDK v6 requires raw JSON
 * Schema objects to be wrapped with `jsonSchema()` — without it the SDK's
 * `asSchema()` calls `.schema()` on the plain object and throws
 * `TypeError: schema is not a function`.
 */
export function buildToolSet(defs: AdapterToolDefinition[]): ToolSet {
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
 * `{ name, arguments, id }` shape the dispatcher expects.
 *
 * AI SDK v6 types tool calls as `TypedToolCall` carrying the payload on an
 * `input` field; the legacy spelling is `args`. We read whichever is present.
 * `id` preserves the provider-assigned `toolCallId` (required by OpenAI /
 * Anthropic for tool-result correlation).
 */
export function normalizeToolCall(call: {
  toolName: string;
  input?: unknown;
  args?: unknown;
  toolCallId?: string;
}): NormalizedToolCall {
  const raw =
    'input' in call && call.input !== undefined ? call.input : call.args;
  const args =
    raw !== null && typeof raw === 'object'
      ? (raw as Record<string, unknown>)
      : {};
  return { name: call.toolName, arguments: args, id: call.toolCallId };
}
