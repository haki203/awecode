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

import { randomUUID } from 'node:crypto';
import { countTokens } from 'gpt-tokenizer';

export type ContextEntryType =
  | 'file'
  | 'snippet'
  | 'symbol'
  | 'command-output'
  | 'diff'
  | 'repo-map';

export interface ContextEntry {
  id: string;
  type: ContextEntryType;
  path?: string;
  lines?: { start: number; end: number };
  content: string;
  tokens: number;
  addedAt: number;
  addedBy: 'user' | 'agent';
}

export function createEntry(
  partial: Omit<ContextEntry, 'id' | 'tokens' | 'addedAt'>,
): ContextEntry {
  return {
    ...partial,
    id: randomUUID(),
    tokens: countTokens(partial.content),
    addedAt: Date.now(),
  };
}

export function createFileEntry(args: {
  path: string;
  content: string;
  lines?: { start: number; end: number };
  addedBy: 'user' | 'agent';
}): ContextEntry {
  return createEntry({
    type: 'file',
    path: args.path,
    content: args.content,
    lines: args.lines,
    addedBy: args.addedBy,
  });
}

export function createCommandOutputEntry(args: {
  content: string;
  addedBy?: 'user' | 'agent';
}): ContextEntry {
  return createEntry({
    type: 'command-output',
    content: args.content,
    addedBy: args.addedBy ?? 'agent',
  });
}

export function createDiffEntry(args: {
  content: string;
  addedBy?: 'user' | 'agent';
}): ContextEntry {
  return createEntry({
    type: 'diff',
    content: args.content,
    addedBy: args.addedBy ?? 'agent',
  });
}
