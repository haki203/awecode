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

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ContextEntryPayload {
  type: 'file' | 'command-output' | 'snippet' | 'web' | 'browser-snapshot' | 'image';
  path?: string;
  content: string;
  url?: string;
  mimeType?: 'image/png' | 'image/webp' | 'image/jpeg';
  base64?: string;
}

export type ToolResult =
  | { ok: true; output: string; contextEntries?: ContextEntryPayload[] }
  | { ok: false; error: string };
