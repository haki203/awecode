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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Path to built-in skills directory.
 * In dev: packages/workflow/skills/
 * In production (after build + npm install): node_modules/@awecode/workflow/skills/
 */
export function getBuiltInSkillsDir(): string {
  return join(__dirname, '..', 'skills');
}

export const BUILT_IN_SKILL_NAMES = ['brainstorm', 'spec', 'grill', 'plan'] as const;

export function listBuiltInSkillNames(): readonly string[] {
  return BUILT_IN_SKILL_NAMES;
}
