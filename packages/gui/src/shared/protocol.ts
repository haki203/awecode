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
 * Wire protocol between the Electron GUI and the CLI child process.
 *
 * The CLI, when invoked with `awecode open gui` (internal: spawns a headless
 * chat session with `--gui-json`), emits one JSON object per line on stdout
 * and reads user input / decisions as JSON objects on stdin. Each line is a
 * complete `GuiAgentEvent` (stdout) or `GuiClientCommand` (stdin).
 *
 * Why NDJSON over stdout instead of embedding the agent in Electron?
 *   1. Keeps the AI SDK + provider deps in the Node CLI bundle only —
 *      Electron's renderer/main stays lean.
 *   2. Crash isolation: a runaway streamText won't tear down the window.
 *   3. Identical behavior to terminal — the same `runChatLoop` drives both.
 */

export type GuiAgentEvent =
  | { type: 'ready'; cwd: string; model?: string; provider?: string }
  | { type: 'message'; role: 'user' | 'assistant' | 'tool'; content: string }
  | { type: 'token'; chunk: string }
  | { type: 'tool_call'; name: string }
  | { type: 'diff_detected'; diff: string }
  | { type: 'intent'; intent: 'workflow' | 'direct'; name?: string | null }
  | { type: 'context_snapshot'; entries: ContextEntrySnapshot[]; totalTokens: number; budgetTokens: number }
  | { type: 'error'; message: string }
  | { type: 'done' };

export interface ContextEntrySnapshot {
  type: string;
  label: string;
  tokens?: number;
}

export type GuiClientCommand =
  | { type: 'prompt'; text: string }
  | { type: 'abort' }
  | { type: 'exit' };

// --- Session history (conversation list) -----------------------------------

export interface SessionMessage {
  role: 'user' | 'assistant' | 'tool' | 'error';
  content: string;
  ts: number;
  toolCallId?: string;
  toolName?: string;
  toolCallArgs?: string;
}

export interface SessionMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  cwd: string;
  model?: string;
  provider?: string;
}

export interface Session extends SessionMeta {
  messages: SessionMessage[];
}
