# Awecode Plan 2: Diff Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@awecode/diff` — search/replace Diff Block parser + fuzzy matcher + anchor-based insert. 100% pure leaf package, fully unit tested, used by Plan 3.

**Architecture:** Pure functions, no IO. `parseDiff()` parses LLM output → `ParsedDiff[]`. `applyDiff(source, blocks)` applies blocks to source string with fuzzy matching via `diff-match-patch`. Anchor resolution via regex symbol search.

**Tech Stack:** TypeScript strict, `diff-match-patch` for fuzzy match, `zod` for runtime validation of LLM output structure.

## Global Constraints

(Same as Plan 1 — see `docs/superpowers/plans/2026-06-19-plan1-foundation-llm-adapter.md#global-constraints`)

**References:**

- Spec: `docs/superpowers/specs/2026-06-19-awecode-design-v2.md` section 4
- ADR-0003: Anchor-based diff insert positioning
- Q4 grill: structured error with suggestions
- Q18 grill: anchor-based instead of line numbers
- Q29 grill: structured error retry strategy

---

## File Structure

```
packages/diff/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts            # public API
│   ├── types.ts            # DiffBlock, ParsedDiff, ApplyResult
│   ├── parse.ts            # parseDiff(llmOutput): ParsedDiff[]
│   ├── fuzzy.ts            # fuzzyMatch(text, search): MatchResult
│   ├── anchor.ts           # resolveAnchor(source, anchor): AnchorResult
│   ├── apply.ts            # applyDiff(source, blocks): ApplyResult
│   └── schema.ts           # zod schema for LLM output validation
└── tests/
    ├── parse.test.ts
    ├── fuzzy.test.ts
    ├── anchor.test.ts
    └── apply.test.ts
```

---

## Task 1: Package skeleton

**Files:**

- Create: `packages/diff/package.json`
- Create: `packages/diff/tsconfig.json`
- Create: `packages/diff/src/index.ts`
- Create: `packages/diff/tests/sanity.test.ts`
- Modify: root `package.json` (add to workspaces — already covers `packages/*`)

- [ ] **Step 1: Create `packages/diff/package.json`**

```json
{
  "name": "@awecode/diff",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: Create `packages/diff/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "tests"]
}
```

- [ ] **Step 3: Create `packages/diff/src/index.ts`**

```ts
// Copyright 2026 Awecode Contributors
// [Apache-2.0 header — same as Plan 1]

export const DIFF_PACKAGE_VERSION = '0.0.0';
```

- [ ] **Step 4: Create sanity test**

```ts
import { describe, it, expect } from 'vitest';
import { DIFF_PACKAGE_VERSION } from '../src/index.js';

describe('sanity', () => {
  it('exports version', () => {
    expect(DIFF_PACKAGE_VERSION).toBe('0.0.0');
  });
});
```

- [ ] **Step 5: Install deps**

Run: `yarn workspace @awecode/diff add diff-match-patch zod`
Run: `yarn workspace @awecode/diff add -D tsup vitest typescript @types/node @types/diff-match-patch`

- [ ] **Step 6: Add `packages/diff` to root `tsconfig.json` references**

Update root `tsconfig.json`:

```json
{
  "extends": "./tsconfig.base.json",
  "references": [
    { "path": "packages/llm" },
    { "path": "packages/cli" },
    { "path": "packages/diff" }
  ],
  "files": []
}
```

- [ ] **Step 7: Run test**

Run: `yarn workspace @awecode/diff test`
Expected: 1 test PASS

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(diff): scaffold @awecode/diff package"
```

---

## Task 2: Types (TDD)

**Files:**

- Create: `packages/diff/src/types.ts`
- Modify: `packages/diff/src/index.ts`
- Test: `packages/diff/tests/types.test.ts`

**Interfaces:**

- Produces: `DiffBlock`, `ParsedDiff`, `ApplyResult`, `Anchor`, `AnchorResult`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import type { DiffBlock, ParsedDiff, ApplyResult, Anchor } from '../src/types.js';

describe('types', () => {
  it('DiffBlock has search and replace', () => {
    const b: DiffBlock = {
      search: 'function foo() {}',
      replace: 'function foo() { return 1; }',
    };
    expect(b.search).toBe('function foo() {}');
  });

  it('DiffBlock has optional anchor', () => {
    const b: DiffBlock = {
      search: '',
      replace: 'new code',
      anchor: { type: 'after', symbol: 'function foo' },
    };
    expect(b.anchor?.type).toBe('after');
  });

  it('ParsedDiff has filePath and blocks', () => {
    const p: ParsedDiff = {
      filePath: 'src/foo.ts',
      blocks: [],
    };
    expect(p.filePath).toBe('src/foo.ts');
  });
});
```

- [ ] **Step 2: Run test to verify fail**

- [ ] **Step 3: Create `packages/diff/src/types.ts`**

```ts
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
```

- [ ] **Step 4: Update `packages/diff/src/index.ts`**

```ts
export type {
  Anchor,
  DiffBlock,
  ParsedDiff,
  ApplyResult,
  SuggestionMatch,
  AnchorResult,
} from './types.js';

export const DIFF_PACKAGE_VERSION = '0.0.0';
```

- [ ] **Step 5: Run test to verify pass**

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(diff): define DiffBlock, ParsedDiff, ApplyResult types"
```

---

## Task 3: parseDiff — LLM output parser (TDD)

**Files:**

- Create: `packages/diff/src/parse.ts`
- Test: `packages/diff/tests/parse.test.ts`
- Modify: `packages/diff/src/index.ts`

**Interfaces:**

- Produces: `parseDiff(llmOutput: string): ParsedDiff[]`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { parseDiff } from '../src/parse.js';

describe('parseDiff', () => {
  it('parses single file single block', () => {
    const input = `file_path: src/foo.ts
<<<< SEARCH
old code
====
new code
>>>> REPLACE`;
    const result = parseDiff(input);
    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe('src/foo.ts');
    expect(result[0].blocks).toHaveLength(1);
    expect(result[0].blocks[0].search).toBe('old code\n');
    expect(result[0].blocks[0].replace).toBe('new code\n');
  });

  it('parses multiple blocks in one file', () => {
    const input = `file_path: src/foo.ts
<<<< SEARCH
old1
====
new1
>>>> REPLACE
<<<< SEARCH
old2
====
new2
>>>> REPLACE`;
    const result = parseDiff(input);
    expect(result[0].blocks).toHaveLength(2);
  });

  it('parses anchor header', () => {
    const input = `file_path: src/foo.ts
at: @after: function bar
<<<< SEARCH
====
new code
>>>> REPLACE`;
    const result = parseDiff(input);
    expect(result[0].blocks[0].anchor).toEqual({
      type: 'after',
      symbol: 'function bar',
    });
  });

  it('parses multiple file sections', () => {
    const input = `file_path: a.ts
<<<< SEARCH
x
====
y
>>>> REPLACE
file_path: b.ts
<<<< SEARCH
p
====
q
>>>> REPLACE`;
    const result = parseDiff(input);
    expect(result).toHaveLength(2);
    expect(result[0].filePath).toBe('a.ts');
    expect(result[1].filePath).toBe('b.ts');
  });

  it('returns empty array on no diff markers', () => {
    expect(parseDiff('just text')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify fail**

- [ ] **Step 3: Create `packages/diff/src/parse.ts`**

```ts
import type { Anchor, DiffBlock, ParsedDiff } from './types.js';

const FILE_PATH_RE = /^file_path:\s*(.+)$/;
const AT_RE = /^at:\s*@(\w+):\s*(.+)$/;
const SEARCH_OPEN = /<<<<\s*SEARCH/;
const SEP = /====/;
const REPLACE_CLOSE = />>>>\s*REPLACE/;

export function parseDiff(input: string): ParsedDiff[] {
  const lines = input.split('\n');
  const results: ParsedDiff[] = [];
  let current: ParsedDiff | null = null;
  let currentBlock: Partial<DiffBlock> & { searchLines: string[]; replaceLines: string[] } | null = null;
  let section: 'none' | 'search' | 'replace' = 'none';

  for (const line of lines) {
    const fpMatch = line.match(FILE_PATH_RE);
    if (fpMatch) {
      if (current && currentBlock) {
        current.blocks.push(finalizeBlock(currentBlock));
      }
      current = { filePath: fpMatch[1].trim(), blocks: [] };
      results.push(current);
      currentBlock = null;
      continue;
    }

    const atMatch = line.match(AT_RE);
    if (atMatch && currentBlock) {
      const type = atMatch[1] === 'after' ? 'after' : 'before';
      currentBlock.anchor = { type, symbol: atMatch[2].trim() };
      continue;
    }

    if (SEARCH_OPEN.test(line)) {
      currentBlock = { searchLines: [], replaceLines: [] };
      section = 'search';
      continue;
    }

    if (SEP.test(line) && currentBlock) {
      section = 'replace';
      continue;
    }

    if (REPLACE_CLOSE.test(line) && currentBlock && current) {
      current.blocks.push(finalizeBlock(currentBlock));
      currentBlock = null;
      section = 'none';
      continue;
    }

    if (currentBlock && section === 'search') {
      currentBlock.searchLines.push(line);
    } else if (currentBlock && section === 'replace') {
      currentBlock.replaceLines.push(line);
    }
  }

  if (current && currentBlock) {
    current.blocks.push(finalizeBlock(currentBlock));
  }

  return results;
}

function finalizeBlock(b: { searchLines: string[]; replaceLines: string[]; anchor?: Anchor }): DiffBlock {
  const search = b.searchLines.join('\n') + (b.searchLines.length > 0 ? '\n' : '');
  const replace = b.replaceLines.join('\n') + (b.replaceLines.length > 0 ? '\n' : '');
  return { search, replace, anchor: b.anchor };
}
```

- [ ] **Step 4: Update `packages/diff/src/index.ts`**

```ts
export { parseDiff } from './parse.js';
```

- [ ] **Step 5: Run test to verify pass**

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(diff): parseDiff parses LLM search/replace output"
```

---

## Task 4: fuzzyMatch — diff-match-patch wrapper (TDD)

**Files:**

- Create: `packages/diff/src/fuzzy.ts`
- Test: `packages/diff/tests/fuzzy.test.ts`
- Modify: `packages/diff/src/index.ts`

**Interfaces:**

- Produces: `fuzzyMatch(text: string, search: string, threshold?: number): MatchResult`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { fuzzyMatch } from '../src/fuzzy.js';

describe('fuzzyMatch', () => {
  const text = `function foo() {
  return 1;
}
function bar() {
  return 2;
}`;

  it('exact match returns position 0', () => {
    const r = fuzzyMatch(text, 'function foo() {\n  return 1;\n}');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.startLine).toBe(0);
  });

  it('whitespace-insensitive match', () => {
    const r = fuzzyMatch(text, 'function foo() {\n    return 1;\n}');
    expect(r.ok).toBe(true);
  });

  it('returns no_match with score when below threshold', () => {
    const r = fuzzyMatch(text, 'completely different text', 0.85);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.bestScore).toBeLessThan(0.85);
  });

  it('returns ambiguous when multiple matches', () => {
    const text2 = 'x\nx\nx';
    const r = fuzzyMatch(text2, 'x');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('ambiguous');
  });
});
```

- [ ] **Step 2: Run test to verify fail**

- [ ] **Step 3: Create `packages/diff/src/fuzzy.ts`**

```ts
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
```

- [ ] **Step 4: Update `packages/diff/src/index.ts`**

```ts
export { fuzzyMatch } from './fuzzy.js';
export type { MatchResult } from './fuzzy.js';
```

- [ ] **Step 5: Run test to verify pass**

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(diff): fuzzyMatch wraps diff-match-patch with suggestions"
```

---

## Task 5: Anchor resolution (TDD)

**Files:**

- Create: `packages/diff/src/anchor.ts`
- Test: `packages/diff/tests/anchor.test.ts`
- Modify: `packages/diff/src/index.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { resolveAnchor } from '../src/anchor.js';

const source = `function foo() {
  return 1;
}

class Bar {
  method() {}
}

function baz() {
  return 2;
}`;

describe('resolveAnchor', () => {
  it('finds function symbol @after', () => {
    const r = resolveAnchor(source, { type: 'after', symbol: 'function foo' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.line).toBe(3);
  });

  it('finds class symbol @before', () => {
    const r = resolveAnchor(source, { type: 'before', symbol: 'class Bar' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.line).toBe(5);
  });

  it('returns not_found with suggestions when symbol missing', () => {
    const r = resolveAnchor(source, { type: 'after', symbol: 'function qux' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe('not_found');
      expect(r.suggestions).toContain('function foo');
    }
  });
});
```

- [ ] **Step 2: Run test to verify fail**

- [ ] **Step 3: Create `packages/diff/src/anchor.ts`**

```ts
import type { Anchor, AnchorResult } from './types.js';

export function resolveAnchor(source: string, anchor: Anchor): AnchorResult {
  const lines = source.split('\n');
  const pattern = escapeRegex(anchor.symbol);

  for (let i = 0; i < lines.length; i++) {
    if (new RegExp(pattern).test(lines[i]!)) {
      return { ok: true, line: anchor.type === 'after' ? i + 1 : i };
    }
  }

  // Not found — collect similar symbols
  const suggestions = collectSimilarSymbols(lines, anchor.symbol);
  return { ok: false, error: 'not_found', suggestions };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectSimilarSymbols(lines: string[], target: string): string[] {
  const keyword = target.split(/\s+/).pop() ?? target;
  const seen = new Set<string>();
  const results: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      /^(function|class|def|fn|public|private|static|export|async)\s/.test(trimmed) &&
      trimmed.includes(keyword.slice(0, 3))
    ) {
      if (!seen.has(trimmed)) {
        seen.add(trimmed);
        results.push(trimmed);
      }
    }
  }
  return results.slice(0, 5);
}
```

- [ ] **Step 4: Update `packages/diff/src/index.ts`**

```ts
export { resolveAnchor } from './anchor.js';
```

- [ ] **Step 5: Run test to verify pass**

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(diff): anchor resolution via symbol pattern matching"
```

---

## Task 6: applyDiff — orchestrator (TDD)

**Files:**

- Create: `packages/diff/src/apply.ts`
- Test: `packages/diff/tests/apply.test.ts`
- Modify: `packages/diff/src/index.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { applyDiff } from '../src/apply.js';
import type { DiffBlock } from '../src/types.js';

describe('applyDiff', () => {
  const source = `line1
line2
line3
line4
line5`;

  it('applies exact match replace', () => {
    const blocks: DiffBlock[] = [
      { search: 'line2\nline3\n', replace: 'LINE2\nLINE3\n' },
    ];
    const r = applyDiff(source, blocks);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result).toBe('line1\nLINE2\nLINE3\nline4\nline5');
  });

  it('inserts at anchor when search empty', () => {
    const blocks: DiffBlock[] = [
      {
        search: '',
        replace: 'inserted\n',
        anchor: { type: 'after', symbol: 'line2' },
      },
    ];
    const r = applyDiff(source, blocks);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result).toContain('inserted');
  });

  it('returns no_match with suggestions on bad search', () => {
    const blocks: DiffBlock[] = [
      { search: 'completely missing', replace: 'whatever' },
    ];
    const r = applyDiff(source, blocks);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('no_match');
  });

  it('returns anchor_not_found when symbol missing', () => {
    const blocks: DiffBlock[] = [
      {
        search: '',
        replace: 'x',
        anchor: { type: 'after', symbol: 'missingSymbol' },
      },
    ];
    const r = applyDiff(source, blocks);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('anchor_not_found');
  });

  it('applies multiple blocks sequentially', () => {
    const blocks: DiffBlock[] = [
      { search: 'line1\n', replace: 'LINE1\n' },
      { search: 'line5', replace: 'LINE5' },
    ];
    const r = applyDiff(source, blocks);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result).toContain('LINE1');
      expect(r.result).toContain('LINE5');
    }
  });
});
```

- [ ] **Step 2: Run test to verify fail**

- [ ] **Step 3: Create `packages/diff/src/apply.ts`**

```ts
import type { ApplyResult, DiffBlock } from './types.js';
import { fuzzyMatch } from './fuzzy.js';
import { resolveAnchor } from './anchor.js';

export function applyDiff(source: string, blocks: DiffBlock[]): ApplyResult {
  let result = source;

  for (const block of blocks) {
    // Case 1: insert (empty search)
    if (block.search === '') {
      if (block.anchor) {
        const anchorRes = resolveAnchor(result, block.anchor);
        if (!anchorRes.ok) {
          return {
            ok: false,
            error: 'anchor_not_found',
            anchor: block.anchor,
            suggestions: anchorRes.suggestions,
          };
        }
        const lines = result.split('\n');
        lines.splice(anchorRes.line, 0, ...block.replace.split('\n').slice(0, -1));
        result = lines.join('\n');
      } else {
        // Append at end
        result = result + (result.endsWith('\n') ? '' : '\n') + block.replace;
      }
      continue;
    }

    // Case 2: replace (non-empty search)
    const matchRes = fuzzyMatch(result, block.search);
    if (!matchRes.ok) {
      if (matchRes.error === 'no_match') {
        return {
          ok: false,
          error: 'no_match',
          block,
          bestScore: matchRes.bestScore,
          suggestions: matchRes.suggestions,
        };
      } else {
        return { ok: false, error: 'ambiguous', matches: matchRes.matches };
      }
    }

    // Replace by string replace (first occurrence)
    const idx = result.indexOf(block.search);
    if (idx !== -1) {
      result = result.slice(0, idx) + block.replace + result.slice(idx + block.search.length);
    } else {
      // Fuzzy replace — approximate
      const lines = result.split('\n');
      const startLine = matchRes.startLine;
      const endLine = matchRes.endLine;
      const newLines = block.replace.split('\n');
      lines.splice(startLine, endLine - startLine + 1, ...newLines);
      result = lines.join('\n');
    }
  }

  return { ok: true, result };
}
```

- [ ] **Step 4: Update `packages/diff/src/index.ts`**

```ts
export { applyDiff } from './apply.js';
```

- [ ] **Step 5: Run test to verify pass**

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(diff): applyDiff orchestrates fuzzy match + anchor resolution"
```

---

## Task 7: Edge cases + property tests

**Files:**

- Test: `packages/diff/tests/edge-cases.test.ts`

- [ ] **Step 1: Write edge case tests**

```ts
import { describe, it, expect } from 'vitest';
import { parseDiff, applyDiff } from '../src/index.js';

describe('edge cases', () => {
  it('parseDiff handles empty input', () => {
    expect(parseDiff('')).toEqual([]);
  });

  it('parseDiff handles trailing whitespace', () => {
    const input = 'file_path: foo.ts\n<<<< SEARCH\n   \n====\n   \n>>>> REPLACE';
    const r = parseDiff(input);
    expect(r[0].blocks[0].search.trim()).toBe('');
  });

  it('applyDiff handles Windows CRLF', () => {
    const source = 'line1\r\nline2\r\nline3';
    const blocks = [{ search: 'line2\r\n', replace: 'LINE2\r\n' }];
    const r = applyDiff(source, blocks);
    expect(r.ok).toBe(true);
  });

  it('applyDiff preserves trailing newline', () => {
    const source = 'line1\nline2\n';
    const blocks = [{ search: 'line2\n', replace: 'LINE2\n' }];
    const r = applyDiff(source, blocks);
    if (r.ok) expect(r.result.endsWith('\n')).toBe(true);
  });

  it('applyDiff handles unicode', () => {
    const source = '// bình luận\nfunction foo() {}';
    const blocks = [{ search: '// bình luận\n', replace: '// comment\n' }];
    const r = applyDiff(source, blocks);
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `yarn workspace @awecode/diff test`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(diff): add edge case tests for CRLF, unicode, empty input"
```

---

## Task 8: Documentation

**Files:**

- Create: `packages/diff/README.md`

- [ ] **Step 1: Write README**

```markdown
# @awecode/diff

Pure leaf package for parsing and applying Aider-style search/replace Diff Blocks with anchor-based insertion and fuzzy matching.

## API

\`\`\`ts
import { parseDiff, applyDiff } from '@awecode/diff';

const llmOutput = \`file_path: src/foo.ts
<<<< SEARCH
old code
====
new code
>>>> REPLACE\`;

const parsed = parseDiff(llmOutput);
// [{ filePath: 'src/foo.ts', blocks: [{ search: 'old code\n', replace: 'new code\n' }] }]

const result = applyDiff(sourceCode, parsed[0].blocks);
if (result.ok) {
  console.log(result.result);
}
\`\`\`

## Anchor grammar

\`\`\`
at: @after: function foo
at: @before: class Bar
\`\`\`

## License

Apache-2.0
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "docs(diff): add package README with API examples"
```

---

## Self-Review

### Spec coverage

- Spec 4.1 (Format): ✅ Task 3 (parser handles `file_path:`, `at:`, multiple blocks)
- Spec 4.2 (Fuzzy matching with diff-match-patch): ✅ Task 4
- Spec 4.3 (API): ✅ Tasks 2-6
- Spec 4.4 (Edge cases + structured error): ✅ Tasks 4, 5, 6, 7
- ADR-0003 (Anchor-based): ✅ Tasks 5, 6
- Q4 grill (suggestions payload): ✅ Task 4
- Q29 grill (structured retry): ✅ Task 6 returns suggestions

### Placeholder scan

All steps have actual code. No TBD.

### Type consistency

- `DiffBlock`, `ApplyResult`, `Anchor`, `ParsedDiff` consistent across all tasks
- `SuggestionMatch` shape consistent in fuzzy.ts and types.ts
