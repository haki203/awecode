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

import type { Anchor, AnchorResult } from './types.js';

export function resolveAnchor(source: string, anchor: Anchor): AnchorResult {
  const lines = source.split('\n');
  const pattern = escapeRegex(anchor.symbol);

  for (let i = 0; i < lines.length; i++) {
    const current = lines[i];
    if (current !== undefined && new RegExp(pattern).test(current)) {
      // `after` resolves to the line immediately following the symbol's body
      // (brace-matched); `before` resolves to the declaration line itself, so
      // a splice inserts above the symbol.
      const line = anchor.type === 'after' ? findBodyEnd(lines, i) + 1 : i;
      return { ok: true, line };
    }
  }

  // Not found — collect similar symbols
  const suggestions = collectSimilarSymbols(lines, anchor.symbol);
  return { ok: false, error: 'not_found', suggestions };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Walk forward from the declaration line tracking brace depth. Returns the
 * index of the line that closes the symbol's top-level block. Falls back to
 * the declaration line itself if no balanced braces are found.
 */
function findBodyEnd(lines: string[], start: number): number {
  let depth = 0;
  let seenOpen = false;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    for (const ch of line) {
      if (ch === '{') {
        depth++;
        seenOpen = true;
      } else if (ch === '}') {
        depth--;
      }
    }
    if (seenOpen && depth <= 0) return i;
  }
  return start;
}

function collectSimilarSymbols(lines: string[], target: string): string[] {
  const parts = target.split(/\s+/);
  const targetKind = parts[0] ?? '';
  const targetName = parts[1] ?? target;
  const prefix = targetName.slice(0, 3);
  const seen = new Set<string>();
  const prefixMatches: string[] = [];
  const sameKindFallback: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const match = /^(function|class|def|fn|public|private|static|export|async)\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(
      trimmed,
    );
    if (!match) continue;
    const kind = match[1] ?? '';
    const name = match[2] ?? '';
    // Canonicalize to the `kind name` form so callers can feed a suggestion
    // straight back into `resolveAnchor` as a new anchor symbol.
    const canonical = `${kind} ${name}`;
    if (seen.has(canonical)) continue;
    seen.add(canonical);

    if (kind === targetKind) {
      if (name.includes(prefix)) {
        prefixMatches.push(canonical);
      } else {
        sameKindFallback.push(canonical);
      }
    }
  }
  // Prefer prefix matches, then top up with any other symbols of the same kind
  // so callers always receive useful candidates.
  const results = [...prefixMatches, ...sameKindFallback];
  return results.slice(0, 5);
}
