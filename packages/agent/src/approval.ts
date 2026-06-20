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

  enqueue(parsed: ParsedDiff): ApprovalRequest {
    const req: ApprovalRequest = {
      id: randomUUID(),
      parsedDiff: parsed,
      filePath: parsed.filePath,
    };
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
