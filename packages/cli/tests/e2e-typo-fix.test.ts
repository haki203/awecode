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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDiff, applyDiff } from '@awecode/diff';
import { ApprovalQueue, ContextManager } from '@awecode/agent';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'awecode-e2e-typo-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('E2E: typo fix via diff', () => {
  it('parses diff and applies fix to file', async () => {
    // 1. Setup: file with typo
    const filePath = join(tmpDir, 'src', 'foo.ts');
    await mkdir(join(tmpDir, 'src'), { recursive: true });
    await writeFile(
      filePath,
      'export function recieve(input: string): string {\n  return input;\n}\n',
      'utf-8',
    );

    // 2. Simulate LLM output (what runChatLoop's onDiffDetected would deliver)
    const llmOutput = `file_path: ${filePath}
<<<< SEARCH
export function recieve(input: string): string {
====
export function receive(input: string): string {
>>>> REPLACE`;

    // 3. Parse
    const parsed = parseDiff(llmOutput);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.blocks).toHaveLength(1);

    // 4. Route through the approval queue the chat loop uses
    const queue = new ApprovalQueue();
    const request = queue.enqueue(parsed[0]!);
    expect(queue.isEmpty).toBe(false);
    const dequeued = queue.dequeue();
    expect(dequeued).toBe(request);
    expect(dequeued?.filePath).toBe(filePath);
    expect(dequeued?.parsedDiff.blocks).toHaveLength(1);
    expect(queue.isEmpty).toBe(true);

    // 5. Record the proposed diff in the context window (as the agent would)
    const context = new ContextManager();
    context.addFile({ path: filePath, content: 'export function recieve(...)', addedBy: 'agent' });
    context.addDiff({ content: llmOutput, addedBy: 'agent' });
    expect(context.snapshot()).toHaveLength(2);

    // 6. Apply — user accepted, so run the diff engine against the file
    const source = await readFile(filePath, 'utf-8');
    const result = applyDiff(source, dequeued!.parsedDiff.blocks);
    expect(result.ok).toBe(true);

    // 7. Write back
    if (result.ok) {
      await writeFile(filePath, result.result, 'utf-8');
      context.refreshFile(filePath, result.result);
    }

    // 8. Verify on disk
    const final = await readFile(filePath, 'utf-8');
    expect(final).toContain('receive');
    expect(final).not.toContain('recieve');

    // 9. Context reflects the post-apply state
    const refreshed = context.snapshot().find((e) => e.path === filePath);
    expect(refreshed?.content).toContain('receive');
  });

  it('rejects an unparseable/empty LLM output without touching the file', async () => {
    const filePath = join(tmpDir, 'no-op.txt');
    const original = 'nothing to change here\n';
    await writeFile(filePath, original, 'utf-8');

    // LLM produced no diff markers — parseDiff yields zero entries
    const parsed = parseDiff('the LLM just rambled, no SEARCH/REPLACE');
    expect(parsed).toHaveLength(0);

    // Nothing to enqueue, file is untouched
    const queue = new ApprovalQueue();
    expect(queue.isEmpty).toBe(true);

    const final = await readFile(filePath, 'utf-8');
    expect(final).toBe(original);
  });
});
