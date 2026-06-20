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
import { join, dirname } from 'node:path';
import { simpleGit } from 'simple-git';
import type { RepoMapCacheData, RankedFile } from './types.js';

export function getCachePath(projectRoot: string): string {
  return join(projectRoot, '.awecode', 'cache', 'repo-map.json');
}

export async function getCommitHash(projectRoot: string): Promise<string> {
  const git = simpleGit(projectRoot);
  return (await git.revparse(['HEAD'])).trim();
}

export async function loadCachedMap(
  projectRoot: string,
): Promise<RepoMapCacheData | null> {
  try {
    const content = await readFile(getCachePath(projectRoot), 'utf-8');
    return JSON.parse(content) as RepoMapCacheData;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function saveCachedMap(
  projectRoot: string,
  data: RepoMapCacheData,
): Promise<void> {
  const path = getCachePath(projectRoot);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2), 'utf-8');
}

export async function getOrGenerateMap(
  projectRoot: string,
  generator: () => Promise<RankedFile[]>,
): Promise<RankedFile[]> {
  const currentHash = await getCommitHash(projectRoot);
  const cached = await loadCachedMap(projectRoot);

  if (cached && cached.commitHash === currentHash) {
    return cached.files;
  }

  const fresh = await generator();
  await saveCachedMap(projectRoot, { commitHash: currentHash, files: fresh });
  return fresh;
}
