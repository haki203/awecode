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

import DMP from 'diff-match-patch';
import type { SuggestionMatch } from './types.js';

const DEFAULT_THRESHOLD = 0.85;

export type MatchResult =
  | { ok: true; startLine: number; endLine: number }
  | { ok: false; error: 'no_match'; bestScore: number; suggestions: SuggestionMatch[] }
  | { ok: false; error: 'ambiguous'; matches: SuggestionMatch[] };

export function fuzzyMatch(text: string, search: string, threshold: number = DEFAULT_THRESHOLD): MatchResult {
  const dmp = new DMP();

  // First try exact match
  const exactIdx = text.indexOf(search);
  if (exactIdx !== -1) {
    const single = text.indexOf(search, exactIdx + 1);
    if (single === -1) {
      return {
        ok: true,
        startLine: countLines(text, 0, exactIdx),
        endLine: countLines(text, 0, exactIdx + search.length) - 1,
      };
    }
    // Multiple exact matches → ambiguous
    const matches: SuggestionMatch[] = [];
    let idx = exactIdx;
    while (idx !== -1) {
      matches.push({
        line: countLines(text, 0, idx),
        preview: text.slice(idx, idx + 40),
        score: 1.0,
      });
      idx = text.indexOf(search, idx + 1);
    }
    return { ok: false, error: 'ambiguous', matches };
  }

  // Fuzzy match via diff-match-patch
  const normalizedText = normalizeWhitespace(text);
  const normalizedSearch = normalizeWhitespace(search);

  const matchIdx = dmp.match_main(normalizedText, normalizedSearch, 0);
  if (matchIdx === -1) {
    return { ok: false, error: 'no_match', bestScore: 0, suggestions: [] };
  }

  // Score: 1 - (levenshtein distance / search length)
  const diffs = dmp.diff_main(
    normalizedText.slice(matchIdx, matchIdx + normalizedSearch.length),
    normalizedSearch,
  );
  const distance = dmp.diff_levenshtein(diffs);
  const score = 1 - distance / Math.max(normalizedSearch.length, 1);

  if (score < threshold) {
    // Find 3 best suggestions
    const suggestions = findTopSuggestions(normalizedText, normalizedSearch, 3);
    return { ok: false, error: 'no_match', bestScore: score, suggestions };
  }

  // Map back to original text line (approximate)
  return {
    ok: true,
    startLine: countLines(text, 0, matchIdx),
    endLine: countLines(text, 0, matchIdx + search.length) - 1,
  };
}

function normalizeWhitespace(s: string): string {
  return s.replace(/[ \t]+/g, ' ').replace(/\s+$/gm, '');
}

function countLines(text: string, from: number, to: number): number {
  let count = 0;
  for (let i = from; i < to && i < text.length; i++) {
    if (text[i] === '\n') count++;
  }
  return count;
}

function findTopSuggestions(text: string, search: string, n: number): SuggestionMatch[] {
  const dmp = new DMP();
  const candidates: SuggestionMatch[] = [];
  // Sample 10 positions, pick top N
  const step = Math.max(Math.floor(text.length / 10), 1);
  for (let i = 0; i < text.length; i += step) {
    const idx = dmp.match_main(text, search, i);
    if (idx === -1) continue;
    const diffs = dmp.diff_main(text.slice(idx, idx + search.length), search);
    const distance = dmp.diff_levenshtein(diffs);
    const score = 1 - distance / Math.max(search.length, 1);
    candidates.push({
      line: countLines(text, 0, idx),
      preview: text.slice(idx, Math.min(idx + 40, text.length)),
      score,
    });
  }
  return candidates.sort((a, b) => b.score - a.score).slice(0, n);
}
