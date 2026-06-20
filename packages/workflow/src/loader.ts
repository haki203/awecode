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

import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parseSkillMarkdown } from './parser.js';
import { getBuiltInSkillsDir } from './builtin.js';
import type { Skill, SkillSource } from './types.js';

/**
 * Resolve a skill by name with precedence: project > user > built-in.
 *
 * - Project skills: `<projectRoot>/.awecode/skills/<name>/SKILL.md`
 * - User skills:    `<userSkillsDir>/<name>/SKILL.md`
 * - Built-in:       bundled `skills/<name>/SKILL.md`
 *
 * Returns null when not found in any location.
 */
export async function loadSkill(
  name: string,
  projectRoot: string,
  userSkillsDir: string,
): Promise<Skill | null> {
  const candidates: Array<{ dir: string; source: SkillSource }> = [
    { dir: join(projectRoot, '.awecode', 'skills'), source: 'project' },
    { dir: userSkillsDir, source: 'user' },
    { dir: getBuiltInSkillsDir(), source: 'built-in' },
  ];

  for (const candidate of candidates) {
    const filePath = join(candidate.dir, name, 'SKILL.md');
    try {
      await stat(filePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw err;
    }
    const content = await readFile(filePath, 'utf-8');
    return parseSkillMarkdown(content, filePath, candidate.source);
  }

  return null;
}

/**
 * List all skill names available across project, user, and built-in locations.
 * Names are deduped (project shadows user shadows built-in) and sorted.
 */
export async function listAvailableSkills(
  projectRoot: string,
  userSkillsDir: string,
): Promise<string[]> {
  const names = new Set<string>();
  const dirs = [
    join(projectRoot, '.awecode', 'skills'),
    userSkillsDir,
    getBuiltInSkillsDir(),
  ];

  for (const dir of dirs) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) names.add(entry.name);
      }
    } catch {
      // dir doesn't exist or unreadable, skip
    }
  }

  return [...names].sort();
}
