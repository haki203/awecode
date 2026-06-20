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

import { loadSkill } from './loader.js';
import type { StartWorkflowResult, InvokeSkillResult } from './types.js';

/**
 * Start a workflow by loading the named skill.
 *
 * Fail-loud: returns `{ ok: false, error }` when the skill is missing or
 * load fails, so the calling agent can fall back to Direct Mode.
 */
export async function startWorkflow(
  name: string,
  projectRoot: string,
  userSkillsDir: string,
): Promise<StartWorkflowResult> {
  try {
    const skill = await loadSkill(name, projectRoot, userSkillsDir);
    if (!skill) {
      return {
        ok: false,
        error: `Workflow "${name}" not found. Available: brainstorm, spec, grill, plan (built-in), plus any custom skills in .awecode/skills/ or ~/.config/awecode/skills/`,
      };
    }
    return {
      ok: true,
      skillName: skill.name,
      skillBody: skill.body,
    };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to load workflow "${name}": ${(err as Error).message}`,
    };
  }
}

/**
 * Invoke a skill and return its body as output.
 *
 * Unlike startWorkflow, this always returns output (error message included
 * in-band when the skill is missing), matching the "always return something"
 * contract for direct skill invocation.
 */
export async function invokeSkill(
  name: string,
  _args: Record<string, unknown>,
  projectRoot: string,
  userSkillsDir: string,
): Promise<InvokeSkillResult> {
  const skill = await loadSkill(name, projectRoot, userSkillsDir);
  if (!skill) {
    return {
      skillName: name,
      output: `Skill "${name}" not found`,
    };
  }
  return {
    skillName: skill.name,
    output: skill.body,
  };
}
