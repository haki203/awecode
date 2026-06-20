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

export interface Anchor {
  type: 'after' | 'before';
  symbol: string;
}

export interface DiffBlock {
  search: string;
  replace: string;
  anchor?: Anchor;
}

export interface ParsedDiff {
  filePath: string;
  blocks: DiffBlock[];
}

export interface SuggestionMatch {
  line: number;
  preview: string;
  score: number;
}

export type ApplyResult =
  | { ok: true; result: string }
  | {
      ok: false;
      error: 'no_match';
      block: DiffBlock;
      bestScore: number;
      suggestions: SuggestionMatch[];
    }
  | {
      ok: false;
      error: 'ambiguous';
      matches: SuggestionMatch[];
    }
  | {
      ok: false;
      error: 'anchor_not_found';
      anchor: Anchor;
      suggestions: string[];
    };

export type AnchorResult =
  | { ok: true; line: number }
  | { ok: false; error: 'not_found'; suggestions: string[] };
