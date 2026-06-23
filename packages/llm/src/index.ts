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

export type {
  ProviderType,
  ProviderConfig,
  AnthropicProviderConfig,
  OpenAIProviderConfig,
  GoogleProviderConfig,
  OllamaProviderConfig,
  OpenAICompatibleProviderConfig,
  AwecodeConfig,
  ModelRef,
  DEFAULT_ENV_KEYS,
} from './types.js';

export {
  loadConfig,
  saveConfig,
  getDefaultConfigPath,
  resolveApiKey,
} from './config.js';
export { createProvider } from './providers.js';
export { chat, streamChat } from './chat.js';
export type { ChatOptions, ChatResult } from './chat.js';
export {
  buildToolSet,
  normalizeToolCall,
} from './adapter.js';
export type {
  AdapterToolDefinition,
  NormalizedToolCall,
} from './adapter.js';
export { streamChatWithTools } from './stream-tools.js';
export type {
  StreamWithToolsOptions,
  StreamWithToolsResult,
} from './stream-tools.js';
export { resolveProviderConfig } from './chat.js';
export {
  resolveContextBudget,
  resolveProviderContextWindow,
  DEFAULT_CONTEXT_WINDOW_FALLBACK,
} from './context-window.js';

export const LLM_PACKAGE_VERSION = '0.0.0';
