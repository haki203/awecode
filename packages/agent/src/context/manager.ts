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
  createUserMessageEntry,
  createAssistantMessageEntry,
  createToolResultEntry,
  createWebEntry,
  createBrowserSnapshotEntry,
  createImageEntry,
} from './entry.js';

export interface AddFileArgs {
  path: string;
  content: string;
  lines?: { start: number; end: number };
  addedBy: 'user' | 'agent';
}

export class ContextManager {
  private entries: ContextEntry[] = [];
  private budget: number;

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

  addUserMessage(content: string): ContextEntry {
    const entry = createUserMessageEntry(content);
    this.entries.push(entry);
    return entry;
  }

  addAssistantMessage(content: string): ContextEntry {
    const entry = createAssistantMessageEntry(content);
    this.entries.push(entry);
    return entry;
  }

  addToolResult(args: { toolName: string; content: string }): ContextEntry {
    const entry = createToolResultEntry(args);
    this.entries.push(entry);
    return entry;
  }

  /**
   * Route a tool's structured `contextEntries` payload into typed ContextEntry
   * records. Each payload type maps to its matching createXxxEntry helper so
   * the context panel, compaction, and resume paths all see the right type.
   * Unrecognised payload types fall back to a snippet-style command-output
   * entry (mirrors the resume fallback for unknown types).
   *
   * Returns the created entries in order, for callers that want to also emit
   * them as multimodal parts to the LLM (see chat.ts image handling).
   */
  addToolContextEntries(
    toolName: string,
    payloads: Array<{
      type: string;
      content: string;
      path?: string;
      url?: string;
      mimeType?: 'image/png' | 'image/webp' | 'image/jpeg';
      base64?: string;
    }>,
  ): ContextEntry[] {
    const created: ContextEntry[] = [];
    for (const p of payloads) {
      let entry: ContextEntry;
      switch (p.type) {
        case 'file':
          entry = createFileEntry({
            path: p.path ?? toolName,
            content: p.content,
            addedBy: 'agent',
          });
          break;
        case 'command-output':
          entry = createCommandOutputEntry({ content: p.content, addedBy: 'agent' });
          break;
        case 'web':
          entry = createWebEntry({
            url: p.url ?? '',
            content: p.content,
            addedBy: 'agent',
          });
          break;
        case 'browser-snapshot':
          entry = createBrowserSnapshotEntry({
            url: p.url ?? '',
            content: p.content,
            addedBy: 'agent',
          });
          break;
        case 'image':
          entry = createImageEntry({
            // image payloads may carry mimeType jpeg (real codec) — coerce to
            // the supported union; the data URL in `content` keeps the exact
            // mime so downstream consumers decode correctly.
            mimeType: (p.mimeType === 'image/webp' ? 'image/webp' : 'image/png') as
              | 'image/png'
              | 'image/webp',
            base64: p.base64 ?? '',
            url: p.url,
            addedBy: 'agent',
          });
          break;
        default:
          // snippet / unknown → store as command-output so it still counts
          // toward the context budget and survives compaction.
          entry = createCommandOutputEntry({
            content: `[${p.type}] ${p.content}`,
            addedBy: 'agent',
          });
      }
      this.entries.push(entry);
      created.push(entry);
    }
    return created;
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

  get entryCount(): number {
    return this.entries.length;
  }

  snapshot(): readonly ContextEntry[] {
    return [...this.entries];
  }

  /**
   * Clear all entries. Used by `/compact` after summarisation completes —
   * the summary itself becomes the new single entry.
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * Replace the entire entry list from a persisted snapshot. Used by
   * session resume to restore the meter to the same state as when the
   * session was saved. Existing entries are dropped first so repeated
   * calls don't accumulate duplicates.
   *
   * Entry objects are shallow-cloned (with fresh array identity) so the
   * caller can keep mutating its source array without leaking into the
   * ContextManager.
   *
   * @param entries  Full entries to install. `tokens` is taken as-is
   *                 (no re-count) so the persisted value round-trips
   *                 exactly. If the caller passes entries without `tokens`,
   *                 they're regenerated via the same `gpt-tokenizer` path
   *                 used by `createEntry`.
   * @param budget   Optional new context budget. When omitted, the
   *                 existing budget is kept.
   */
  restore(entries: ContextEntry[], budget?: number): void {
    this.entries = entries.map((e) => ({ ...e }));
    if (budget !== undefined) this.budget = budget;
  }

  /**
   * Serialise the current entries for persistence. Returns shallow
   * clones so the returned array can be safely stored, transferred, or
   * JSON-stringified without aliasing internal state.
   */
  toRecords(): ContextEntry[] {
    return this.entries.map((e) => ({ ...e }));
  }

  toMessages(): ModelMessage[] {
    if (this.entries.length === 0) return [];
    const blocks = this.entries.map((e) => {
      let header: string;
      switch (e.type) {
        case 'file':
          header = `File: ${e.path}${e.lines ? ` (lines ${e.lines.start}-${e.lines.end})` : ''}`;
          break;
        case 'user-message':
          header = 'User';
          break;
        case 'assistant-message':
          header = 'Assistant';
          break;
        case 'tool-result':
          header = 'Tool result';
          break;
        default:
          header = `[${e.type}]`;
      }
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
