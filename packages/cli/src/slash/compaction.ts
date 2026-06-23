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

import { registerSlashCommand, type SlashContext } from './index.js';

/**
 * Canonical name is `/compact` (aligns with Cline, Cursor, and standard AI
 * assistant vocabulary). `/smol` and `/condense` remain as aliases for
 * muscle-memory and backwards compatibility — ADR-0006 previously
 * standardised on `/smol` based on a misreading of Cline issue #7222
 * (that issue is about *models* mis-emitting `/compact` as a tool call,
 * not about users typing it).
 */
export const COMPACT_PRIMARY = 'compact';
export const COMPACT_ALIASES = ['smol', 'condense'] as const;

export function registerCompactionSlashCommands(): void {
  const compactHandler = async (_args: string[], _ctx: SlashContext) => {
    console.log('⚡ Compacting context...');
    console.log('(This command triggers LLM-based summarization. Wire to chat loop to use.)');
  };

  registerSlashCommand({
    name: COMPACT_PRIMARY,
    description: `Compact conversation via LLM summarisation (aliases: /${COMPACT_ALIASES.join(', /')})`,
    handler: compactHandler,
  });

  for (const alias of COMPACT_ALIASES) {
    registerSlashCommand({
      name: alias,
      description: `Alias for /${COMPACT_PRIMARY}`,
      handler: compactHandler,
    });
  }

  registerSlashCommand({
    name: 'tokens',
    description: 'Show token usage breakdown',
    handler: async (_args, _ctx) => {
      console.log('Token usage: (wire to ContextManager for real values)');
    },
  });

  registerSlashCommand({
    name: 'checkpoint',
    description: 'Save snapshot of current context',
    handler: async (_args, _ctx) => {
      console.log('📸 Checkpoint saved (wire to ContextManager for real save)');
    },
  });

  registerSlashCommand({
    name: 'restore',
    description: 'Restore from checkpoint: /restore <id>',
    handler: async (args, _ctx) => {
      if (args.length === 0) {
        console.log('Usage: /restore <checkpoint-id>');
        return;
      }
      console.log(`Restoring from checkpoint ${args[0]}... (wire to ContextManager)`);
    },
  });
}
