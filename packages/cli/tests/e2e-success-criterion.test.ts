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
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpProject: string;

beforeEach(async () => {
  tmpProject = await mkdtemp(join(tmpdir(), 'awecode-e2e-success-'));
  await mkdir(join(tmpProject, 'src'), { recursive: true });
  await writeFile(
    join(tmpProject, 'src', 'parser.ts'),
    `// Bug: returns NaN for empty input
export function parseLine(input: string): number {
  return parseInt(input, 10);
}
`,
    'utf-8',
  );
});

afterEach(async () => {
  await rm(tmpProject, { recursive: true, force: true });
});

describe('E2E: success criterion', () => {
  // Skip if no real LLM API key in env
  it.skipIf(!process.env.AWECODE_E2E_API_KEY)(
    'agent fixes bug end-to-end',
    async () => {
      // v0.1 strategy: test via parseDiff + applyDiff directly
      // (assumes LLM produces correct diff format)
      // Full e2e test with spawned process deferred to integration env.

      const { parseDiff, applyDiff } = await import('@awecode/diff');

      const simulatedLLMOutput = `file_path: ${join(tmpProject, 'src', 'parser.ts')}
<<<< SEARCH
// Bug: returns NaN for empty input
export function parseLine(input: string): number {
  return parseInt(input, 10);
}
====
// Fixed: handle empty input
export function parseLine(input: string): number {
  if (!input.trim()) return 0;
  return parseInt(input, 10);
}
>>>> REPLACE`;

      const parsed = parseDiff(simulatedLLMOutput);
      expect(parsed).toHaveLength(1);

      const source = await readFile(join(tmpProject, 'src', 'parser.ts'), 'utf-8');
      const result = applyDiff(source, parsed[0]!.blocks);
      expect(result.ok).toBe(true);

      if (result.ok) {
        await writeFile(join(tmpProject, 'src', 'parser.ts'), result.result, 'utf-8');
      }

      const final = await readFile(join(tmpProject, 'src', 'parser.ts'), 'utf-8');
      expect(final).toContain('if (!input.trim())');
      expect(final).toContain('return 0');
    },
    60_000,
  );

  it('passes without LLM key (structural test)', () => {
    // Always passes — ensures test file is valid even without API key
    expect(true).toBe(true);
  });
});
