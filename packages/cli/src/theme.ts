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

/**
 * Centralized theme tokens for the awecode TUI.
 *
 * Inspired by Codex CLI / OpenCode: a small, consistent palette with soft
 * "muted" colors so the eye is drawn to content, not chrome. Colors are
 * compatible with the vast majority of modern terminals (truecolor-aware
 * fallback handled by Ink's `supportsColor`).
 */
export const colors = {
  // Brand accents
  user: '#7dd3fc', // sky-300 — user prompts
  agent: '#86efac', // green-300 — agent replies
  tool: '#a8a29e', // stone-400 — tool calls / metadata
  accent: '#c4b5fd', // violet-300 — highlights / brand
  warn: '#fcd34d', // amber-300 — warnings
  danger: '#fca5a5', // red-300 — errors

  // Severity for the token meter
  ok: '#86efac',
  moderate: '#fcd34d',
  severe: '#fca5a5',

  // Surface
  border: '#3f3f46', // zinc-700 — subtle borders
  borderStrong: '#71717a', // zinc-500 — focused / overlay borders
  muted: '#71717a', // zinc-500 — dim text
} as const;

/** Braille spinner frames (same set Codex / Claude Code use). */
export const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;

/** Short label for a context entry type, used by status/overlay views. */
export function entryTypeGlyph(type: string): string {
  switch (type) {
    case 'file':
      return '󰈙'; // nf-md-file
    case 'snippet':
      return '✂';
    case 'symbol':
      return 'ƒ';
    case 'command-output':
      return '▸';
    case 'diff':
      return 'Δ';
    case 'repo-map':
      return '🗺';
    default:
      return '•';
  }
}
