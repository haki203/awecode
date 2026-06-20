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

import { startWorkflow } from '@awecode/workflow';
import { registerSlashCommand, type SlashContext } from './index.js';

export function registerWorkflowSlashCommands(): void {
  for (const name of ['brainstorm', 'spec', 'grill', 'plan']) {
    registerSlashCommand({
      name,
      description: `Invoke ${name} workflow`,
      handler: async (_args: string[], ctx: SlashContext) => {
        const result = await startWorkflow(name, ctx.projectRoot, ctx.userSkillsDir);
        if (result.ok) {
          console.log(`⚡ Workflow started: ${name}\n`);
          console.log(
            result.skillBody.slice(0, 500) +
              (result.skillBody.length > 500 ? '...' : ''),
          );
        } else {
          console.error(`✗ ${result.error}`);
        }
      },
    });
  }

  registerSlashCommand({
    name: 'skip-workflow',
    description: 'Force agent into Direct Mode (no workflow pipeline)',
    handler: async () => {
      console.log('Direct Mode active. Agent will respond without workflow pipeline.');
    },
  });
}
