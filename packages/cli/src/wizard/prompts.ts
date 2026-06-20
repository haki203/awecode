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

export const PROVIDER_CHOICES = [
  { label: 'OpenAI (GPT models)', value: 'openai' },
  { label: 'Anthropic (Claude models)', value: 'anthropic' },
  { label: 'Google (Gemini models)', value: 'google' },
  { label: 'Ollama (local — no API key needed)', value: 'ollama' },
  { label: 'OpenAI-compatible (OpenRouter, Together, etc.)', value: 'openai-compatible' },
  { label: 'Skip — exit without configuring', value: 'skip' },
] as const;

export const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet',
  google: 'gemini-1.5-flash',
  ollama: 'llama3',
  'openai-compatible': '',
};
