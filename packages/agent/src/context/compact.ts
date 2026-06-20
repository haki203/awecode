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

import { generateText } from 'ai';
import { createProvider } from '@awecode/llm';
import type { AwecodeConfig } from '@awecode/llm';
import { countTokens } from 'gpt-tokenizer';
import type { ContextEntry } from './entry.js';

const SUMMARIZATION_PROMPT = `Summarize the conversation so far. PRESERVE:
1. Original user task statement
2. Key design decisions made
3. Files currently in context (paths + brief description)
4. Errors encountered and resolutions
5. Last 5 user-assistant turns (verbatim)

DISCARD:
- Verbose tool output (full file contents already in context entries)
- Redundant code reads
- Intermediate exploration that didn't lead to decisions

Output format: Markdown with sections [Task], [Decisions], [Files], [Errors], [Recent Turns].`;

export interface CompactionResult {
  summary: string;
  tokensSaved: number;
}

export async function compactContext(
  config: AwecodeConfig,
  entries: ContextEntry[],
  recentTurns: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<CompactionResult> {
  const providerConfig = config.providers[config.activeProvider];
  if (!providerConfig) throw new Error('No active provider');

  const model = createProvider(providerConfig);
  const beforeTokens = entries.reduce((s, e) => s + e.tokens, 0);

  const conversationText = entries.map((e) => e.content).join('\n\n');
  const recentText = recentTurns
    .map((t) => `${t.role}: ${t.content}`)
    .join('\n');

  const result = await generateText({
    model,
    system: SUMMARIZATION_PROMPT,
    prompt: `Conversation to summarize:\n\n${conversationText}\n\n--- Recent turns ---\n${recentText}`,
    maxOutputTokens: 2048,
  });

  const afterTokens = countTokens(result.text);
  return {
    summary: result.text,
    tokensSaved: Math.max(0, beforeTokens - afterTokens),
  };
}
