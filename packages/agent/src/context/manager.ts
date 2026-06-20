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

import type { ModelMessage } from 'ai';
import type { ContextEntry } from './entry.js';
import {
  createFileEntry,
  createCommandOutputEntry,
  createDiffEntry,
} from './entry.js';

export interface AddFileArgs {
  path: string;
  content: string;
  lines?: { start: number; end: number };
  addedBy: 'user' | 'agent';
}

export class ContextManager {
  private entries: ContextEntry[] = [];
  private readonly budget: number;

  constructor(budget: number = 100_000) {
    this.budget = budget;
  }

  addFile(args: AddFileArgs): ContextEntry {
    const entry = createFileEntry(args);
    this.entries.push(entry);
    return entry;
  }

  addCommandOutput(args: {
    content: string;
    addedBy?: 'user' | 'agent';
  }): ContextEntry {
    const entry = createCommandOutputEntry(args);
    this.entries.push(entry);
    return entry;
  }

  addDiff(args: { content: string; addedBy?: 'user' | 'agent' }): ContextEntry {
    const entry = createDiffEntry(args);
    this.entries.push(entry);
    return entry;
  }

  removeEntry(id: string): boolean {
    const idx = this.entries.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    this.entries.splice(idx, 1);
    return true;
  }

  refreshFile(path: string, newContent: string): void {
    const idx = this.entries.findIndex((e) => e.path === path);
    if (idx === -1) return;
    const existing = this.entries[idx]!;
    this.entries[idx] = createFileEntry({
      path,
      content: newContent,
      lines: existing.lines,
      addedBy: existing.addedBy,
    });
  }

  get totalTokens(): number {
    return this.entries.reduce((sum, e) => sum + e.tokens, 0);
  }

  get utilization(): number {
    if (this.budget === 0) return 0;
    return this.totalTokens / this.budget;
  }

  get budgetTokens(): number {
    return this.budget;
  }

  snapshot(): readonly ContextEntry[] {
    return [...this.entries];
  }

  toMessages(): ModelMessage[] {
    if (this.entries.length === 0) return [];
    const blocks = this.entries.map((e) => {
      const header = e.path
        ? `File: ${e.path}${e.lines ? ` (lines ${e.lines.start}-${e.lines.end})` : ''}`
        : `[${e.type}]`;
      return `--- ${header} ---\n${e.content}`;
    });
    return [
      {
        role: 'system',
        content: `Context entries:\n\n${blocks.join('\n\n')}`,
      },
    ];
  }
}
