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

import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import type { ApprovalDecision } from '@awecode/agent';
import type { ParsedDiffBlock } from './diff-interceptor.js';

export interface ApprovalPrompterOptions {
  abortSignal?: AbortSignal;
}

const KEY_MAP: Record<string, ApprovalDecision> = {
  y: 'accept',
  n: 'reject',
  e: 'edit',
  s: 'skip_all',
  a: 'accept_all',
  q: 'quit',
};

export class ApprovalPrompter {
  constructor(
    private opts: ApprovalPrompterOptions = {},
  ) {}

  async prompt(block: ParsedDiffBlock): Promise<ApprovalDecision> {
    const rl = readline.createInterface({ input, output });
    try {
      console.log(`\n--- Diff for ${block.filePath} ---`);
      console.log(block.text);
      const answer = await rl.question('Approve? [y]es / [n]o / [e]dit / [s]kip-all / [a]ccept-all / [q]uit: ');
      const key = answer.trim().toLowerCase().charAt(0);
      return KEY_MAP[key] ?? 'reject';
    } finally {
      rl.close();
    }
  }
}
