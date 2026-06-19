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

export type ProviderType =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'ollama'
  | 'openai-compatible';

export interface BaseProviderConfig {
  defaultModel: string;
}

export interface AnthropicProviderConfig extends BaseProviderConfig {
  type: 'anthropic';
  apiKey: string;
}

export interface OpenAIProviderConfig extends BaseProviderConfig {
  type: 'openai';
  apiKey: string;
}

export interface GoogleProviderConfig extends BaseProviderConfig {
  type: 'google';
  apiKey: string;
}

export interface OllamaProviderConfig extends BaseProviderConfig {
  type: 'ollama';
  baseURL?: string;
}

export interface OpenAICompatibleProviderConfig extends BaseProviderConfig {
  type: 'openai-compatible';
  baseURL: string;
  apiKey: string;
}

export type ProviderConfig =
  | AnthropicProviderConfig
  | OpenAIProviderConfig
  | GoogleProviderConfig
  | OllamaProviderConfig
  | OpenAICompatibleProviderConfig;

export interface AwecodeConfig {
  activeProvider: string;
  providers: Record<string, ProviderConfig>;
}

export interface ModelRef {
  providerId: string;
  modelName: string;
}
