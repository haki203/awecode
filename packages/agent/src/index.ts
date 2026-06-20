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

export type { ContextEntry, ContextEntryType } from './context/entry.js';
export {
  createEntry,
  createFileEntry,
  createCommandOutputEntry,
  createDiffEntry,
} from './context/entry.js';

export { ContextManager } from './context/manager.js';
export type { AddFileArgs } from './context/manager.js';

export { ApprovalQueue } from './approval.js';
export type { ApprovalRequest, ApprovalDecision } from './approval.js';

export { detectIntentFromText } from './intent.js';
export type { IntentDeclaration } from './intent.js';

export { runChatLoop, DEFAULT_SYSTEM_PROMPT } from './chat.js';
export type { ChatLoopOptions } from './chat.js';

export const AGENT_PACKAGE_VERSION = '0.0.0';
