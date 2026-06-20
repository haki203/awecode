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
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveConfig, loadConfig, chat } from '@awecode/llm';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'awecode-e2e-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('E2E: config save -> load -> chat', () => {
  // Skip the real-LLM test unless an API key (or any truthy sentinel) is
  // provided via AWECODE_E2E_API_KEY. In CI this env var is unset, so only
  // the missing-config test below runs.
  const apiKey = process.env.AWECODE_E2E_API_KEY;

  it.skipIf(!apiKey)('saves ollama config, loads it, calls chat', async () => {
    const cfg = {
      activeProvider: 'ollama',
      providers: {
        ollama: {
          type: 'ollama' as const,
          baseURL: 'http://localhost:11434',
          defaultModel: 'llama3',
        },
      },
    };
    const cfgPath = join(tmpDir, 'config.yaml');
    await saveConfig(cfgPath, cfg);
    const loaded = await loadConfig(cfgPath);
    expect(loaded).not.toBeNull();

    const result = await chat(loaded!, [{ role: 'user', content: 'Say hi in 1 word' }]);
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.usage.totalTokens).toBeGreaterThan(0);
  });

  it('handles missing config gracefully', async () => {
    const cfgPath = join(tmpDir, 'nonexistent.yaml');
    const loaded = await loadConfig(cfgPath);
    expect(loaded).toBeNull();
  });
});
