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

import { writeFile, readFile, mkdir, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { ContextEntry } from './entry.js';

export interface Checkpoint {
  timestamp: string;
  trigger: 'auto-compact' | 'manual /smol';
  preCompactTokens: number;
  entries: ContextEntry[];
  conversationHistory: unknown[];
}

function getCheckpointsDir(projectRoot: string): string {
  return join(projectRoot, '.awecode', 'history');
}

function getCheckpointPath(projectRoot: string, id: string): string {
  return join(getCheckpointsDir(projectRoot), `checkpoint-${id}.json`);
}

export async function saveCheckpoint(
  projectRoot: string,
  checkpoint: Checkpoint,
): Promise<string> {
  const id = checkpoint.timestamp.replace(/[:.]/g, '-');
  const path = getCheckpointPath(projectRoot, id);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(checkpoint, null, 2), 'utf-8');
  return id;
}

export async function loadCheckpoint(
  projectRoot: string,
  id: string,
): Promise<Checkpoint | null> {
  try {
    const content = await readFile(getCheckpointPath(projectRoot, id), 'utf-8');
    return JSON.parse(content) as Checkpoint;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function listCheckpoints(projectRoot: string): Promise<string[]> {
  try {
    const files = await readdir(getCheckpointsDir(projectRoot));
    return files
      .filter((f) => f.startsWith('checkpoint-') && f.endsWith('.json'))
      .map((f) => f.replace('checkpoint-', '').replace('.json', ''))
      .sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}
