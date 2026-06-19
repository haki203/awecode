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

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { join, dirname } from 'node:path';
import { parse, stringify } from 'yaml';
import type { AwecodeConfig } from './types.js';

export async function loadConfig(configPath: string): Promise<AwecodeConfig | null> {
  try {
    const content = await readFile(configPath, 'utf-8');
    const parsed = parse(content) as AwecodeConfig;
    return parsed ?? null;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

export async function saveConfig(configPath: string, config: AwecodeConfig): Promise<void> {
  await mkdir(dirname(configPath), { recursive: true });
  const yaml = stringify(config);
  await writeFile(configPath, yaml, 'utf-8');
}

export function getDefaultConfigPath(): string {
  const home = homedir();
  if (platform() === 'win32') {
    return join(home, '.config', 'awecode', 'config.yaml');
  }
  return join(home, '.config', 'awecode', 'config.yaml');
}
