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
import type { ParsedDiff } from '@awecode/diff';

export interface ApprovalRequest {
  id: string;
  parsedDiff: ParsedDiff;
  filePath: string;
}

export type ApprovalDecision = 'accept' | 'reject' | 'edit' | 'skip';

export class ApprovalQueue {
  private queue: ApprovalRequest[] = [];
  // Content-hash → original request. A model that resends the same block
  // across iterations would otherwise enqueue identical approval requests;
  // we silently drop the duplicate and return the first-seen request. Entries
  // persist across dequeue() so a diff already reviewed cannot re-enter.
  private seen: Map<string, ApprovalRequest> = new Map();

  enqueue(parsed: ParsedDiff): ApprovalRequest {
    const key = diffHash(parsed);
    const existing = this.seen.get(key);
    if (existing) return existing;
    const req: ApprovalRequest = {
      id: randomUUID(),
      parsedDiff: parsed,
      filePath: parsed.filePath,
    };
    this.seen.set(key, req);
    this.queue.push(req);
    return req;
  }

  dequeue(): ApprovalRequest | undefined {
    return this.queue.shift();
  }

  get pending(): readonly ApprovalRequest[] {
    return [...this.queue];
  }

  get isEmpty(): boolean {
    return this.queue.length === 0;
  }
}

/**
 * Stable content hash for a ParsedDiff so the queue can detect re-emitted
 * blocks. JSON.stringify is deterministic given identical key order, which the
 * parser produces; collisions across semantically-different diffs are not a
 * concern in practice (worst case: a genuinely different block is skipped).
 */
function diffHash(parsed: ParsedDiff): string {
  return JSON.stringify({
    filePath: parsed.filePath,
    blocks: parsed.blocks.map((b) => ({
      search: b.search,
      replace: b.replace,
      anchor: b.anchor,
    })),
  });
}
