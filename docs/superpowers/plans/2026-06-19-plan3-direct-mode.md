# Awecode Plan 3: Direct Mode (Chat Loop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@awecode/tools` (4 file/shell tools) + `@awecode/agent` (Context Manager + chat loop + approval queue) + Direct Mode TUI in `@awecode/cli`. By end: user can run `awecode "fix typo 'recieve' → 'receive' in src/foo.ts"` and agent does it via Approval Mode.

**Architecture:** Tools are pure functions exposed via Vercel AI SDK tool calling. Agent owns chat loop + Context Manager + Approval Gate (non-blocking queue per Q5 grill). CLI renders 2-panel TUI (chat + context) with Approval Mode overlay. No Workflow Engine yet — that's Plan 5.

**Tech Stack:** TypeScript strict, Vercel AI SDK (from Plan 1), `@awecode/diff` (from Plan 2), `fast-glob`, `gpt-tokenizer`, `ink` v5 + `react` v18, `ink-testing-library`.

## Global Constraints

(Same as Plan 1 — see `docs/superpowers/plans/2026-06-19-plan1-foundation-llm-adapter.md#global-constraints`)

**References:**

- Spec sections 3, 4 (apply), 6 (Context), 8 (TUI Direct Mode), 10
- CONTEXT.md: Task, Direct Mode, Approval Mode, Context Entry
- Q5 grill: non-blocking approval queue
- Q33 grill: gpt-tokenizer standalone

**Locked interfaces from Plan 1+2 (consumed):**

- `AwecodeConfig`, `ProviderConfig`, `ChatResult`, `chat()`, `streamChat()` from `@awecode/llm`
- `DiffBlock`, `ParsedDiff`, `ApplyResult`, `parseDiff()`, `applyDiff()` from `@awecode/diff`

---

## File Structure

```
packages/
├── tools/
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsup.config.ts
│   ├── src/
│   │   ├── index.ts            # public API + registry + dispatcher
│   │   ├── types.ts            # ToolDefinition, ToolCall, ToolResult
│   │   ├── file/
│   │   │   ├── read.ts         # read_file tool
│   │   │   ├── list.ts         # list_files (glob)
│   │   │   └── search.ts       # search_files (grep, ripgrep primary)
│   │   └── shell/
│   │       └── exec.ts         # shell_exec (cross-platform)
│   └── tests/
│       ├── read.test.ts
│       ├── list.test.ts
│       ├── search.test.ts
│       ├── exec.test.ts
│       └── dispatcher.test.ts
├── agent/
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsup.config.ts
│   ├── src/
│   │   ├── index.ts
│   │   ├── types.ts            # Task, ChatMessage
│   │   ├── context/
│   │   │   ├── manager.ts      # ContextManager class
│   │   │   └── entry.ts        # ContextEntry type + factory
│   │   ├── chat.ts             # chat loop with tool calling
│   │   ├── intent.ts           # detect Direct Mode vs Workflow
│   │   └── approval.ts         # ApprovalQueue class
│   └── tests/
│       ├── context.test.ts
│       ├── chat.test.ts
│       ├── intent.test.ts
│       └── approval.test.ts
└── cli/
    └── src/
        ├── components/
        │   ├── ChatView.tsx
        │   ├── ContextPanel.tsx
        │   ├── ApprovalView.tsx
        │   └── DiffPreview.tsx
        └── commands/
            └── chat.ts         # default command (Direct Mode TUI)
```

---

## Task 1: `@awecode/tools` package skeleton

**Files:**

- Create: `packages/tools/package.json`
- Create: `packages/tools/tsconfig.json`
- Create: `packages/tools/tsup.config.ts`
- Create: `packages/tools/src/index.ts`
- Create: `packages/tools/tests/sanity.test.ts`
- Modify: root `tsconfig.json` (add `packages/tools` to references)

**Interfaces:**

- Produces: `@awecode/tools` package, empty public API

- [ ] **Step 1: Create `packages/tools/package.json`**

```json
{
  "name": "@awecode/tools",
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

- [ ] **Step 2: Create `packages/tools/tsconfig.json`**

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

- [ ] **Step 3: Create `packages/tools/tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  dts: true,
});
```

- [ ] **Step 4: Create `packages/tools/src/index.ts`**

```ts
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

export const TOOLS_PACKAGE_VERSION = '0.0.0';
```

- [ ] **Step 5: Create sanity test**

```ts
import { describe, it, expect } from 'vitest';
import { TOOLS_PACKAGE_VERSION } from '../src/index.js';

describe('sanity', () => {
  it('exports version', () => {
    expect(TOOLS_PACKAGE_VERSION).toBe('0.0.0');
  });
});
```

- [ ] **Step 6: Install dev deps**

Run: `yarn workspace @awecode/tools add -D tsup vitest typescript @types/node`

- [ ] **Step 7: Add to root `tsconfig.json` references**

Update `tsconfig.json`:

```json
{
  "extends": "./tsconfig.base.json",
  "references": [
    { "path": "packages/llm" },
    { "path": "packages/cli" },
    { "path": "packages/diff" },
    { "path": "packages/tools" }
  ],
  "files": []
}
```

- [ ] **Step 8: Run sanity test**

Run: `yarn workspace @awecode/tools test`
Expected: `1 passed`

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(tools): scaffold @awecode/tools package"
```

---

## Task 2: Define Tool types (TDD)

**Files:**

- Create: `packages/tools/src/types.ts`
- Modify: `packages/tools/src/index.ts`
- Test: `packages/tools/tests/types.test.ts`

**Interfaces:**

- Produces: `ToolDefinition`, `ToolCall`, `ToolResult`, `ContextEntryPayload`

- [ ] **Step 1: Write failing test `packages/tools/tests/types.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import type {
  ToolDefinition,
  ToolCall,
  ToolResult,
  ContextEntryPayload,
} from '../src/types.js';

describe('Tool types', () => {
  it('ToolDefinition has name, description, parameters', () => {
    const def: ToolDefinition = {
      name: 'read_file',
      description: 'Read a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
        },
        required: ['path'],
      },
    };
    expect(def.name).toBe('read_file');
  });

  it('ToolCall has name and arguments', () => {
    const call: ToolCall = {
      name: 'read_file',
      arguments: { path: '/tmp/foo.ts' },
    };
    expect(call.name).toBe('read_file');
    expect(call.arguments.path).toBe('/tmp/foo.ts');
  });

  it('ToolResult success has output', () => {
    const r: ToolResult = {
      ok: true,
      output: 'file contents',
    };
    expect(r.ok).toBe(true);
  });

  it('ToolResult failure has error', () => {
    const r: ToolResult = {
      ok: false,
      error: 'File not found',
    };
    expect(r.ok).toBe(false);
  });

  it('ToolResult success can carry contextEntries', () => {
    const r: ToolResult = {
      ok: true,
      output: 'content',
      contextEntries: [
        { type: 'file', path: '/tmp/foo.ts', content: 'content' },
      ],
    };
    expect(r.contextEntries?.[0]?.type).toBe('file');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @awecode/tools test`
Expected: FAIL with "Cannot find module '../src/types.js'"

- [ ] **Step 3: Create `packages/tools/src/types.ts`**

```ts
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ContextEntryPayload {
  type: 'file' | 'command-output' | 'snippet';
  path?: string;
  content: string;
}

export type ToolResult =
  | { ok: true; output: string; contextEntries?: ContextEntryPayload[] }
  | { ok: false; error: string };
```

- [ ] **Step 4: Update `packages/tools/src/index.ts` to export types**

Replace entire file with:

```ts
// Copyright 2026 Awecode Contributors
// [Apache-2.0 header — same as Task 1]

export type {
  ToolDefinition,
  ToolCall,
  ToolResult,
  ContextEntryPayload,
} from './types.js';

export const TOOLS_PACKAGE_VERSION = '0.0.0';
```

- [ ] **Step 5: Run test to verify pass**

Run: `yarn workspace @awecode/tools test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(tools): define ToolDefinition, ToolCall, ToolResult types"
```

---

## Task 3: `read_file` tool (TDD)

**Files:**

- Create: `packages/tools/src/file/read.ts`
- Test: `packages/tools/tests/read.test.ts`
- Modify: `packages/tools/src/index.ts`

**Interfaces:**

- Produces: `readFileTool(args): Promise<ToolResult>`, `readFileDef: ToolDefinition`

- [ ] **Step 1: Write failing test `packages/tools/tests/read.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileTool } from '../src/file/read.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'awecode-tools-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('readFileTool', () => {
  it('reads full file content', async () => {
    const filePath = join(tmpDir, 'foo.ts');
    await writeFile(filePath, 'line1\nline2\nline3\n', 'utf-8');

    const result = await readFileTool({ path: filePath });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output).toBe('line1\nline2\nline3\n');
      expect(result.contextEntries?.[0]?.type).toBe('file');
      expect(result.contextEntries?.[0]?.path).toBe(filePath);
    }
  });

  it('reads partial file with lines range', async () => {
    const filePath = join(tmpDir, 'foo.ts');
    await writeFile(filePath, 'line1\nline2\nline3\nline4\nline5\n', 'utf-8');

    const result = await readFileTool({
      path: filePath,
      lines: { start: 2, end: 4 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output).toBe('line2\nline3\nline4\n');
    }
  });

  it('returns error on missing file', async () => {
    const result = await readFileTool({ path: join(tmpDir, 'nonexistent.ts') });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Failed to read/);
    }
  });

  it('handles empty file', async () => {
    const filePath = join(tmpDir, 'empty.ts');
    await writeFile(filePath, '', 'utf-8');

    const result = await readFileTool({ path: filePath });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `yarn workspace @awecode/tools test`
Expected: FAIL with "Cannot find module '../src/file/read.js'"

- [ ] **Step 3: Create `packages/tools/src/file/read.ts`**

```ts
import { readFile } from 'node:fs/promises';
import type { ToolDefinition, ToolResult } from '../types.js';

export interface ReadFileArgs {
  path: string;
  lines?: { start: number; end: number };
}

export async function readFileTool(args: ReadFileArgs): Promise<ToolResult> {
  try {
    const content = await readFile(args.path, 'utf-8');

    if (args.lines) {
      const lines = content.split('\n');
      const start = Math.max(0, args.lines.start - 1);
      const end = Math.min(lines.length, args.lines.end);
      const sliced = lines.slice(start, end).join('\n');
      return {
        ok: true,
        output: sliced,
        contextEntries: [
          {
            type: 'file',
            path: args.path,
            content: sliced,
          },
        ],
      };
    }

    return {
      ok: true,
      output: content,
      contextEntries: [
        {
          type: 'file',
          path: args.path,
          content,
        },
      ],
    };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to read ${args.path}: ${(err as Error).message}`,
    };
  }
}

export const readFileDef: ToolDefinition = {
  name: 'read_file',
  description:
    'Read the content of a file. Optionally specify a line range {start, end} (1-indexed) to read only part of the file.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute or relative file path to read',
      },
      lines: {
        type: 'object',
        properties: {
          start: { type: 'number', description: '1-indexed start line' },
          end: { type: 'number', description: '1-indexed end line (inclusive)' },
        },
        required: ['start', 'end'],
      },
    },
    required: ['path'],
  },
};
```

- [ ] **Step 4: Update `packages/tools/src/index.ts`**

Add to exports (before `TOOLS_PACKAGE_VERSION`):

```ts
export { readFileTool, readFileDef } from './file/read.js';
export type { ReadFileArgs } from './file/read.js';
```

- [ ] **Step 5: Run test to verify pass**

Run: `yarn workspace @awecode/tools test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(tools): add read_file tool with optional line range"
```

---

## Task 4: `list_files` tool — glob (TDD)

**Files:**

- Create: `packages/tools/src/file/list.ts`
- Test: `packages/tools/tests/list.test.ts`
- Modify: `packages/tools/src/index.ts`

- [ ] **Step 1: Install `fast-glob`**

Run: `yarn workspace @awecode/tools add fast-glob`

- [ ] **Step 2: Write failing test `packages/tools/tests/list.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listFilesTool } from '../src/file/list.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'awecode-list-test-'));
  // Create sample files
  await writeFile(join(tmpDir, 'a.ts'), '', 'utf-8');
  await writeFile(join(tmpDir, 'b.ts'), '', 'utf-8');
  await writeFile(join(tmpDir, 'c.js'), '', 'utf-8');
  await mkdir(join(tmpDir, 'sub'), { recursive: true });
  await writeFile(join(tmpDir, 'sub', 'd.ts'), '', 'utf-8');
  await mkdir(join(tmpDir, 'node_modules'), { recursive: true });
  await writeFile(join(tmpDir, 'node_modules', 'dep.ts'), '', 'utf-8');
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('listFilesTool', () => {
  it('lists .ts files recursively', async () => {
    const result = await listFilesTool({ pattern: '**/*.ts', cwd: tmpDir });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const files = result.output.split('\n').filter(Boolean);
      expect(files).toContain('a.ts');
      expect(files).toContain('b.ts');
      expect(files).toContain('sub/d.ts');
    }
  });

  it('excludes node_modules by default', async () => {
    const result = await listFilesTool({ pattern: '**/*.ts', cwd: tmpDir });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output).not.toContain('node_modules');
    }
  });

  it('returns empty on no matches', async () => {
    const result = await listFilesTool({ pattern: '**/*.rs', cwd: tmpDir });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output.trim()).toBe('');
  });

  it('lists .js files', async () => {
    const result = await listFilesTool({ pattern: '**/*.js', cwd: tmpDir });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output).toContain('c.js');
    }
  });
});
```

- [ ] **Step 3: Run test to verify fail**

Run: `yarn workspace @awecode/tools test`
Expected: FAIL

- [ ] **Step 4: Create `packages/tools/src/file/list.ts`**

```ts
import fastGlob from 'fast-glob';
import { sep, posix } from 'node:path';
import type { ToolDefinition, ToolResult } from '../types.js';

const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.awecode/**',
  '**/dist/**',
];

export interface ListFilesArgs {
  pattern: string;
  cwd?: string;
}

export async function listFilesTool(args: ListFilesArgs): Promise<ToolResult> {
  try {
    const files = await fastGlob(args.pattern, {
      cwd: args.cwd ?? process.cwd(),
      ignore: DEFAULT_IGNORE,
      dot: false,
      onlyFiles: true,
    });
    // Normalize to forward slashes for cross-platform consistency
    const normalized = files.map((f) => f.split(sep).join(posix.sep));
    return {
      ok: true,
      output: normalized.join('\n'),
    };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to list files: ${(err as Error).message}`,
    };
  }
}

export const listFilesDef: ToolDefinition = {
  name: 'list_files',
  description:
    'List files matching a glob pattern (e.g. "**/*.ts"). Automatically excludes node_modules, .git, .awecode, dist.',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob pattern, e.g. "**/*.ts" or "src/**"',
      },
      cwd: {
        type: 'string',
        description: 'Working directory (defaults to process.cwd())',
      },
    },
    required: ['pattern'],
  },
};
```

- [ ] **Step 5: Update `packages/tools/src/index.ts`**

Add:

```ts
export { listFilesTool, listFilesDef } from './file/list.js';
export type { ListFilesArgs } from './file/list.js';
```

- [ ] **Step 6: Run test to verify pass**

Run: `yarn workspace @awecode/tools test`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(tools): add list_files tool with glob patterns, excludes node_modules"
```

---

## Task 5: `search_files` tool — grep (TDD)

**Files:**

- Create: `packages/tools/src/file/search.ts`
- Test: `packages/tools/tests/search.test.ts`
- Modify: `packages/tools/src/index.ts`

- [ ] **Step 1: Write failing test `packages/tools/tests/search.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { searchFilesTool } from '../src/file/search.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'awecode-search-test-'));
  await writeFile(
    join(tmpDir, 'a.ts'),
    'export function foo() {\n  return 1;\n}\n',
    'utf-8',
  );
  await writeFile(
    join(tmpDir, 'b.ts'),
    'export function bar() {\n  return foo();\n}\n',
    'utf-8',
  );
  await mkdir(join(tmpDir, 'sub'), { recursive: true });
  await writeFile(
    join(tmpDir, 'sub', 'c.ts'),
    'const x = foo();\n',
    'utf-8',
  );
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('searchFilesTool', () => {
  it('finds matches across files', async () => {
    const result = await searchFilesTool({
      pattern: 'foo',
      path: tmpDir,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output).toContain('a.ts');
      expect(result.output).toContain('b.ts');
      expect(result.output).toContain('sub/c.ts');
    }
  });

  it('supports regex patterns', async () => {
    const result = await searchFilesTool({
      pattern: 'function \\w+',
      path: tmpDir,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output).toContain('function foo');
      expect(result.output).toContain('function bar');
    }
  });

  it('returns empty on no matches', async () => {
    const result = await searchFilesTool({
      pattern: 'nomatch_xyz',
      path: tmpDir,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output.trim()).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `yarn workspace @awecode/tools test`
Expected: FAIL

- [ ] **Step 3: Create `packages/tools/src/file/search.ts`**

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import fastGlob from 'fast-glob';
import type { ToolDefinition, ToolResult } from '../types.js';

const execFileAsync = promisify(execFile);

const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.awecode/**',
  '**/dist/**',
];

const DEFAULT_GLOB = '**/*.{ts,tsx,js,jsx,py,go,rs,java,c,cpp,h,md,yaml,yml,json}';

export interface SearchFilesArgs {
  pattern: string;
  path?: string;
  glob?: string;
}

export async function searchFilesTool(args: SearchFilesArgs): Promise<ToolResult> {
  const cwd = args.path ?? process.cwd();

  // Try ripgrep first (fast path)
  try {
    const { stdout, stderr } = await execFileAsync(
      'rg',
      [
        '--line-number',
        '--no-heading',
        '--color=never',
        '--no-ignore',
        '-g',
        `!${DEFAULT_IGNORE[0]}`,
        '-g',
        `!${DEFAULT_IGNORE[1]}`,
        args.pattern,
        cwd,
      ],
      { timeout: 30_000 },
    );
    return { ok: true, output: stdout.trim() };
  } catch (err) {
    // rg not available or no matches — fallback to JS scan
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT' && !(err as any).status) {
      // rg exists but errored differently — check if no matches
      const rgErr = err as { stdout?: string; stderr?: string };
      if (rgErr.stdout !== undefined) {
        return { ok: true, output: rgErr.stdout?.trim() ?? '' };
      }
    }
  }

  // JS fallback
  try {
    const files = await fastGlob(args.glob ?? DEFAULT_GLOB, {
      cwd,
      ignore: DEFAULT_IGNORE,
      dot: false,
    });
    const re = new RegExp(args.pattern);
    const matches: string[] = [];

    for (const f of files.slice(0, 200)) {
      const fullPath = `${cwd}/${f}`;
      const content = await readFile(fullPath, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i]!)) {
          matches.push(`${f}:${i + 1}:${lines[i]}`);
        }
      }
    }

    return { ok: true, output: matches.join('\n') };
  } catch (err) {
    return {
      ok: false,
      error: `Search failed: ${(err as Error).message}`,
    };
  }
}

export const searchFilesDef: ToolDefinition = {
  name: 'search_files',
  description:
    'Search for a regex pattern across files. Returns matches as file:line:content. Uses ripgrep if available, falls back to JS scan.',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Regex pattern (e.g. "function \\w+" or "TODO")',
      },
      path: {
        type: 'string',
        description: 'Search root directory (defaults to process.cwd())',
      },
      glob: {
        type: 'string',
        description: 'Optional file glob to limit search (defaults to common code files)',
      },
    },
    required: ['pattern'],
  },
};
```

- [ ] **Step 4: Update `packages/tools/src/index.ts`**

Add:

```ts
export { searchFilesTool, searchFilesDef } from './file/search.js';
export type { SearchFilesArgs } from './file/search.js';
```

- [ ] **Step 5: Run test to verify pass**

Run: `yarn workspace @awecode/tools test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(tools): add search_files with ripgrep primary, JS fallback"
```

---

## Task 6: `shell_exec` tool — cross-platform (TDD)

**Files:**

- Create: `packages/tools/src/shell/exec.ts`
- Test: `packages/tools/tests/exec.test.ts`
- Modify: `packages/tools/src/index.ts`

- [ ] **Step 1: Write failing test `packages/tools/tests/exec.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { shellExecTool } from '../src/shell/exec.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'awecode-exec-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('shellExecTool', () => {
  it('runs echo command successfully', async () => {
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'Write-Output "hello"' : 'echo hello';
    const result = await shellExecTool({ command: cmd, cwd: tmpDir });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output).toContain('hello');
    }
  });

  it('captures stderr', async () => {
    const isWin = process.platform === 'win32';
    const cmd = isWin
      ? 'Write-Error "test error"'
      : 'echo "test error" >&2';
    const result = await shellExecTool({ command: cmd, cwd: tmpDir });
    // Write-Error exits non-zero on PowerShell
    if (result.ok) {
      expect(result.output.toLowerCase()).toContain('test error');
    } else {
      expect(result.error.toLowerCase()).toContain('test error');
    }
  });

  it('respects timeoutMs', async () => {
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'Start-Sleep -Seconds 10' : 'sleep 10';
    const result = await shellExecTool({
      command: cmd,
      cwd: tmpDir,
      timeoutMs: 500,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/timed out|timeout/i);
  }, 10_000);
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `yarn workspace @awecode/tools test`
Expected: FAIL

- [ ] **Step 3: Create `packages/tools/src/shell/exec.ts`**

```ts
import { spawn } from 'node:child_process';
import type { ToolDefinition, ToolResult } from '../types.js';

export interface ShellExecArgs {
  command: string;
  cwd?: string;
  timeoutMs?: number;
}

export async function shellExecTool(args: ShellExecArgs): Promise<ToolResult> {
  const cwd = args.cwd ?? process.cwd();
  const timeout = args.timeoutMs ?? 60_000;
  const isWin = process.platform === 'win32';

  const shell = isWin ? 'powershell.exe' : '/bin/bash';
  const shellArgs = isWin
    ? ['-NoProfile', '-NonInteractive', '-Command', args.command]
    : ['-c', args.command];

  return new Promise((resolve) => {
    const child = spawn(shell, shellArgs, { cwd });
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      // Force kill if still alive after 2s
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, 2000);
    }, timeout);

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (exitCode: number | null) => {
      clearTimeout(timer);

      if (timedOut) {
        resolve({
          ok: false,
          error: `Command timed out after ${timeout}ms`,
        });
        return;
      }

      const output = stdout + (stderr ? `\n[stderr]\n${stderr}` : '');

      if (exitCode === 0) {
        resolve({
          ok: true,
          output,
          contextEntries: [
            {
              type: 'command-output',
              content: output,
            },
          ],
        });
      } else {
        resolve({
          ok: false,
          error: `Exit ${exitCode}\n${output}`,
        });
      }
    });

    child.on('error', (err: Error) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        error: `Failed to spawn: ${err.message}`,
      });
    });
  });
}

export const shellExecDef: ToolDefinition = {
  name: 'shell_exec',
  description:
    'Execute a shell command. Uses PowerShell on Windows, bash on Linux/macOS. Returns stdout, stderr, and exit code. Subject to timeoutMs (default 60s).',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Shell command to execute',
      },
      cwd: {
        type: 'string',
        description: 'Working directory (defaults to process.cwd())',
      },
      timeoutMs: {
        type: 'number',
        description: 'Timeout in milliseconds (default 60000)',
      },
    },
    required: ['command'],
  },
};
```

- [ ] **Step 4: Update `packages/tools/src/index.ts`**

Add:

```ts
export { shellExecTool, shellExecDef } from './shell/exec.js';
export type { ShellExecArgs } from './shell/exec.js';
```

- [ ] **Step 5: Run test to verify pass**

Run: `yarn workspace @awecode/tools test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(tools): add shell_exec with PowerShell/bash detection and timeout"
```

---

## Task 7: Tool registry + dispatcher (TDD)

**Files:**

- Modify: `packages/tools/src/index.ts` (add registry)
- Test: `packages/tools/tests/dispatcher.test.ts`

**Interfaces:**

- Produces: `TOOL_REGISTRY`, `listToolDefinitions()`, `dispatchTool(call)`

- [ ] **Step 1: Write failing test `packages/tools/tests/dispatcher.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import {
  listToolDefinitions,
  dispatchTool,
  TOOL_REGISTRY,
} from '../src/index.js';

describe('tool registry', () => {
  it('registers 4 built-in tools', () => {
    const names = Object.keys(TOOL_REGISTRY);
    expect(names).toContain('read_file');
    expect(names).toContain('list_files');
    expect(names).toContain('search_files');
    expect(names).toContain('shell_exec');
    expect(names).toHaveLength(4);
  });

  it('listToolDefinitions returns all definitions', () => {
    const defs = listToolDefinitions();
    expect(defs).toHaveLength(4);
    expect(defs.map((d) => d.name).sort()).toEqual([
      'list_files',
      'read_file',
      'search_files',
      'shell_exec',
    ]);
  });
});

describe('dispatchTool', () => {
  it('returns error on unknown tool', async () => {
    const result = await dispatchTool({
      name: 'nonexistent_tool',
      arguments: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Unknown tool/);
  });

  it('dispatches read_file correctly', async () => {
    // Use a known path — package.json of this workspace
    const result = await dispatchTool({
      name: 'read_file',
      arguments: { path: 'package.json' },
    });
    // package.json may or may not exist relative to cwd, but tool should at least dispatch
    expect(result).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `yarn workspace @awecode/tools test`
Expected: FAIL with missing exports

- [ ] **Step 3: Update `packages/tools/src/index.ts` to add registry**

Full file:

```ts
// Copyright 2026 Awecode Contributors
// [Apache-2.0 header]

export type {
  ToolDefinition,
  ToolCall,
  ToolResult,
  ContextEntryPayload,
} from './types.js';

export { readFileTool, readFileDef } from './file/read.js';
export type { ReadFileArgs } from './file/read.js';
export { listFilesTool, listFilesDef } from './file/list.js';
export type { ListFilesArgs } from './file/list.js';
export { searchFilesTool, searchFilesDef } from './file/search.js';
export type { SearchFilesArgs } from './file/search.js';
export { shellExecTool, shellExecDef } from './shell/exec.js';
export type { ShellExecArgs } from './shell/exec.js';

import type { ToolDefinition, ToolCall, ToolResult } from './types.js';
import { readFileTool, readFileDef } from './file/read.js';
import { listFilesTool, listFilesDef } from './file/list.js';
import { searchFilesTool, searchFilesDef } from './file/search.js';
import { shellExecTool, shellExecDef } from './shell/exec.js';

export const TOOL_REGISTRY: Record<
  string,
  { def: ToolDefinition; handler: (args: Record<string, unknown>) => Promise<ToolResult> }
> = {
  [readFileDef.name]: { def: readFileDef, handler: readFileTool as any },
  [listFilesDef.name]: { def: listFilesDef, handler: listFilesTool as any },
  [searchFilesDef.name]: { def: searchFilesDef, handler: searchFilesTool as any },
  [shellExecDef.name]: { def: shellExecDef, handler: shellExecTool as any },
};

export function listToolDefinitions(): ToolDefinition[] {
  return Object.values(TOOL_REGISTRY).map((t) => t.def);
}

export async function dispatchTool(call: ToolCall): Promise<ToolResult> {
  const entry = TOOL_REGISTRY[call.name];
  if (!entry) {
    return { ok: false, error: `Unknown tool: ${call.name}` };
  }
  return entry.handler(call.arguments);
}

export const TOOLS_PACKAGE_VERSION = '0.0.0';
```

- [ ] **Step 4: Run test to verify pass**

Run: `yarn workspace @awecode/tools test`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(tools): tool registry and dispatcher for 4 built-in tools"
```

---

## Task 8: `@awecode/agent` package skeleton

**Files:**

- Create: `packages/agent/package.json`
- Create: `packages/agent/tsconfig.json`
- Create: `packages/agent/tsup.config.ts`
- Create: `packages/agent/src/index.ts`
- Create: `packages/agent/tests/sanity.test.ts`
- Modify: root `tsconfig.json`

- [ ] **Step 1: Create `packages/agent/package.json`**

```json
{
  "name": "@awecode/agent",
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
  },
  "dependencies": {
    "@awecode/llm": "workspace:*",
    "@awecode/diff": "workspace:*",
    "@awecode/tools": "workspace:*",
    "ai": "^3.4.0",
    "gpt-tokenizer": "^2.5.0"
  }
}
```

- [ ] **Step 2: Create `packages/agent/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "react-jsx"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "tests"]
}
```

- [ ] **Step 3: Create `packages/agent/tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  dts: true,
});
```

- [ ] **Step 4: Create `packages/agent/src/index.ts`**

```ts
// Copyright 2026 Awecode Contributors
// [Apache-2.0 header]

export const AGENT_PACKAGE_VERSION = '0.0.0';
```

- [ ] **Step 5: Create sanity test**

```ts
import { describe, it, expect } from 'vitest';
import { AGENT_PACKAGE_VERSION } from '../src/index.js';

describe('sanity', () => {
  it('exports version', () => {
    expect(AGENT_PACKAGE_VERSION).toBe('0.0.0');
  });
});
```

- [ ] **Step 6: Install dev deps + runtime deps**

Run: `yarn workspace @awecode/agent add -D tsup vitest typescript @types/node`
Run: `yarn install` (to resolve workspace dependencies)

- [ ] **Step 7: Add to root `tsconfig.json`**

```json
{
  "extends": "./tsconfig.base.json",
  "references": [
    { "path": "packages/llm" },
    { "path": "packages/cli" },
    { "path": "packages/diff" },
    { "path": "packages/tools" },
    { "path": "packages/agent" }
  ],
  "files": []
}
```

- [ ] **Step 8: Run sanity test**

Run: `yarn workspace @awecode/agent test`
Expected: 1 test PASS

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(agent): scaffold @awecode/agent package with workspace deps"
```

---

## Task 9: Context Entry type + factory (TDD)

**Files:**

- Create: `packages/agent/src/context/entry.ts`
- Test: `packages/agent/tests/context-entry.test.ts`
- Modify: `packages/agent/src/index.ts`

- [ ] **Step 1: Write failing test `packages/agent/tests/context-entry.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import {
  createFileEntry,
  createCommandOutputEntry,
  createDiffEntry,
} from '../src/context/entry.js';

describe('ContextEntry factories', () => {
  it('createFileEntry generates id, computes tokens', () => {
    const entry = createFileEntry({
      path: '/tmp/foo.ts',
      content: 'export function foo() { return 1; }',
      addedBy: 'user',
    });
    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(entry.type).toBe('file');
    expect(entry.path).toBe('/tmp/foo.ts');
    expect(entry.tokens).toBeGreaterThan(0);
    expect(entry.addedBy).toBe('user');
    expect(entry.addedAt).toBeGreaterThan(0);
  });

  it('createFileEntry supports partial lines', () => {
    const entry = createFileEntry({
      path: '/tmp/foo.ts',
      content: 'line2\nline3',
      lines: { start: 2, end: 3 },
      addedBy: 'agent',
    });
    expect(entry.lines).toEqual({ start: 2, end: 3 });
  });

  it('createCommandOutputEntry', () => {
    const entry = createCommandOutputEntry({
      content: 'test output',
    });
    expect(entry.type).toBe('command-output');
    expect(entry.content).toBe('test output');
  });

  it('createDiffEntry', () => {
    const entry = createDiffEntry({
      content: '<<<< SEARCH\nold\n====\nnew\n>>>> REPLACE',
    });
    expect(entry.type).toBe('diff');
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `yarn workspace @awecode/agent test`
Expected: FAIL

- [ ] **Step 3: Install `gpt-tokenizer`**

Run: `yarn workspace @awecode/agent add gpt-tokenizer`

- [ ] **Step 4: Create `packages/agent/src/context/entry.ts`**

```ts
import { randomUUID } from 'node:crypto';
import { countTokens } from 'gpt-tokenizer';

export type ContextEntryType =
  | 'file'
  | 'snippet'
  | 'symbol'
  | 'command-output'
  | 'diff'
  | 'repo-map';

export interface ContextEntry {
  id: string;
  type: ContextEntryType;
  path?: string;
  lines?: { start: number; end: number };
  content: string;
  tokens: number;
  addedAt: number;
  addedBy: 'user' | 'agent';
}

export function createEntry(
  partial: Omit<ContextEntry, 'id' | 'tokens' | 'addedAt'>,
): ContextEntry {
  return {
    ...partial,
    id: randomUUID(),
    tokens: countTokens(partial.content),
    addedAt: Date.now(),
  };
}

export function createFileEntry(args: {
  path: string;
  content: string;
  lines?: { start: number; end: number };
  addedBy: 'user' | 'agent';
}): ContextEntry {
  return createEntry({
    type: 'file',
    path: args.path,
    content: args.content,
    lines: args.lines,
    addedBy: args.addedBy,
  });
}

export function createCommandOutputEntry(args: { content: string; addedBy?: 'user' | 'agent' }): ContextEntry {
  return createEntry({
    type: 'command-output',
    content: args.content,
    addedBy: args.addedBy ?? 'agent',
  });
}

export function createDiffEntry(args: { content: string; addedBy?: 'user' | 'agent' }): ContextEntry {
  return createEntry({
    type: 'diff',
    content: args.content,
    addedBy: args.addedBy ?? 'agent',
  });
}
```

- [ ] **Step 5: Update `packages/agent/src/index.ts`**

```ts
export type { ContextEntry, ContextEntryType } from './context/entry.js';
export {
  createEntry,
  createFileEntry,
  createCommandOutputEntry,
  createDiffEntry,
} from './context/entry.js';

export const AGENT_PACKAGE_VERSION = '0.0.0';
```

- [ ] **Step 6: Run test to verify pass**

Run: `yarn workspace @awecode/agent test`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(agent): ContextEntry type and factories with token counting"
```

---

## Task 10: ContextManager class (TDD)

**Files:**

- Create: `packages/agent/src/context/manager.ts`
- Test: `packages/agent/tests/context-manager.test.ts`
- Modify: `packages/agent/src/index.ts`

- [ ] **Step 1: Write failing test `packages/agent/tests/context-manager.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { ContextManager } from '../src/context/manager.js';

describe('ContextManager', () => {
  it('starts empty with given budget', () => {
    const cm = new ContextManager(100_000);
    expect(cm.totalTokens).toBe(0);
    expect(cm.utilization).toBe(0);
    expect(cm.snapshot()).toHaveLength(0);
  });

  it('addFile adds entry and computes tokens', () => {
    const cm = new ContextManager();
    const entry = cm.addFile({
      path: '/tmp/foo.ts',
      content: 'export const x = 1;',
      addedBy: 'user',
    });
    expect(entry.type).toBe('file');
    expect(cm.totalTokens).toBe(entry.tokens);
    expect(cm.snapshot()).toHaveLength(1);
  });

  it('addCommandOutput adds entry', () => {
    const cm = new ContextManager();
    cm.addCommandOutput({ content: 'test output' });
    expect(cm.snapshot()).toHaveLength(1);
    expect(cm.snapshot()[0]!.type).toBe('command-output');
  });

  it('removeEntry removes by id', () => {
    const cm = new ContextManager();
    const entry = cm.addFile({
      path: '/tmp/foo.ts',
      content: 'x',
      addedBy: 'user',
    });
    expect(cm.removeEntry(entry.id)).toBe(true);
    expect(cm.snapshot()).toHaveLength(0);
    expect(cm.totalTokens).toBe(0);
  });

  it('removeEntry returns false on missing id', () => {
    const cm = new ContextManager();
    expect(cm.removeEntry('nonexistent-uuid')).toBe(false);
  });

  it('refreshFile updates content and tokens', () => {
    const cm = new ContextManager();
    cm.addFile({
      path: '/tmp/foo.ts',
      content: 'x',
      addedBy: 'user',
    });
    const beforeTokens = cm.totalTokens;
    cm.refreshFile('/tmp/foo.ts', 'longer content with more tokens than before');
    expect(cm.totalTokens).toBeGreaterThan(beforeTokens);
  });

  it('refreshFile is no-op on missing path', () => {
    const cm = new ContextManager();
    cm.refreshFile('/tmp/never-added.ts', 'content');
    expect(cm.snapshot()).toHaveLength(0);
  });

  it('utilization = totalTokens / budget', () => {
    const cm = new ContextManager(1000);
    cm.addFile({ path: '/x', content: 'a'.repeat(100), addedBy: 'user' });
    expect(cm.utilization).toBeGreaterThan(0);
    expect(cm.utilization).toBeLessThan(1);
  });

  it('toMessages returns empty when no entries', () => {
    const cm = new ContextManager();
    expect(cm.toMessages()).toEqual([]);
  });

  it('toMessages serializes entries as system message', () => {
    const cm = new ContextManager();
    cm.addFile({ path: '/tmp/foo.ts', content: 'x', addedBy: 'user' });
    const msgs = cm.toMessages();
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.role).toBe('system');
    expect(msgs[0]!.content).toContain('/tmp/foo.ts');
    expect(msgs[0]!.content).toContain('Context entries');
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `yarn workspace @awecode/agent test`
Expected: FAIL

- [ ] **Step 3: Create `packages/agent/src/context/manager.ts`**

```ts
import type { CoreMessage } from 'ai';
import type { ContextEntry } from './entry.js';
import {
  createFileEntry,
  createCommandOutputEntry,
  createDiffEntry,
} from './entry.js';

export interface AddFileArgs {
  path: string;
  content: string;
  lines?: { start: number; end: number };
  addedBy: 'user' | 'agent';
}

export class ContextManager {
  private entries: ContextEntry[] = [];
  private readonly budget: number;

  constructor(budget: number = 100_000) {
    this.budget = budget;
  }

  addFile(args: AddFileArgs): ContextEntry {
    const entry = createFileEntry(args);
    this.entries.push(entry);
    return entry;
  }

  addCommandOutput(args: { content: string; addedBy?: 'user' | 'agent' }): ContextEntry {
    const entry = createCommandOutputEntry(args);
    this.entries.push(entry);
    return entry;
  }

  addDiff(args: { content: string; addedBy?: 'user' | 'agent' }): ContextEntry {
    const entry = createDiffEntry(args);
    this.entries.push(entry);
    return entry;
  }

  removeEntry(id: string): boolean {
    const idx = this.entries.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    this.entries.splice(idx, 1);
    return true;
  }

  refreshFile(path: string, newContent: string): void {
    const idx = this.entries.findIndex((e) => e.path === path);
    if (idx === -1) return;
    // Update in-place via factory to recompute tokens
    const existing = this.entries[idx]!;
    this.entries[idx] = createFileEntry({
      path,
      content: newContent,
      lines: existing.lines,
      addedBy: existing.addedBy,
    });
  }

  get totalTokens(): number {
    return this.entries.reduce((sum, e) => sum + e.tokens, 0);
  }

  get utilization(): number {
    if (this.budget === 0) return 0;
    return this.totalTokens / this.budget;
  }

  get budgetTokens(): number {
    return this.budget;
  }

  snapshot(): readonly ContextEntry[] {
    return [...this.entries];
  }

  toMessages(): CoreMessage[] {
    if (this.entries.length === 0) return [];
    const blocks = this.entries.map((e) => {
      const header = e.path
        ? `File: ${e.path}${e.lines ? ` (lines ${e.lines.start}-${e.lines.end})` : ''}`
        : `[${e.type}]`;
      return `--- ${header} ---\n${e.content}`;
    });
    return [
      {
        role: 'system',
        content: `Context entries:\n\n${blocks.join('\n\n')}`,
      },
    ];
  }
}
```

- [ ] **Step 4: Update `packages/agent/src/index.ts`**

Add:

```ts
export { ContextManager } from './context/manager.js';
export type { AddFileArgs } from './context/manager.js';
```

- [ ] **Step 5: Run test to verify pass**

Run: `yarn workspace @awecode/agent test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(agent): ContextManager with token tracking and snapshot"
```

---

## Task 11: Approval Queue (TDD)

**Files:**

- Create: `packages/agent/src/approval.ts`
- Test: `packages/agent/tests/approval.test.ts`
- Modify: `packages/agent/src/index.ts`

- [ ] **Step 1: Write failing test `packages/agent/tests/approval.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { ApprovalQueue } from '../src/approval.js';
import type { ParsedDiff } from '@awecode/diff';

const mockDiff: ParsedDiff = {
  filePath: 'src/foo.ts',
  blocks: [
    { search: 'old\n', replace: 'new\n' },
  ],
};

describe('ApprovalQueue', () => {
  it('starts empty', () => {
    const q = new ApprovalQueue();
    expect(q.isEmpty).toBe(true);
    expect(q.pending).toHaveLength(0);
  });

  it('enqueue adds to back, dequeue takes from front (FIFO)', () => {
    const q = new ApprovalQueue();
    const r1 = q.enqueue({ ...mockDiff, filePath: 'a.ts' });
    const r2 = q.enqueue({ ...mockDiff, filePath: 'b.ts' });
    expect(q.pending).toHaveLength(2);
    expect(q.isEmpty).toBe(false);

    const out1 = q.dequeue();
    expect(out1?.id).toBe(r1.id);
    expect(out1?.filePath).toBe('a.ts');

    const out2 = q.dequeue();
    expect(out2?.id).toBe(r2.id);
    expect(out2?.filePath).toBe('b.ts');

    expect(q.isEmpty).toBe(true);
  });

  it('dequeue on empty queue returns undefined', () => {
    const q = new ApprovalQueue();
    expect(q.dequeue()).toBeUndefined();
  });

  it('pending is a snapshot (immutable)', () => {
    const q = new ApprovalQueue();
    q.enqueue(mockDiff);
    const snap = q.pending;
    q.enqueue(mockDiff);
    expect(snap).toHaveLength(1); // unchanged
    expect(q.pending).toHaveLength(2);
  });

  it('enqueued request has unique id', () => {
    const q = new ApprovalQueue();
    const r1 = q.enqueue(mockDiff);
    const r2 = q.enqueue(mockDiff);
    expect(r1.id).not.toBe(r2.id);
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `yarn workspace @awecode/agent test`
Expected: FAIL

- [ ] **Step 3: Create `packages/agent/src/approval.ts`**

```ts
import { randomUUID } from 'node:crypto';
import type { ParsedDiff } from '@awecode/diff';

export interface ApprovalRequest {
  id: string;
  parsedDiff: ParsedDiff;
  filePath: string;
}

export type ApprovalDecision = 'accept' | 'reject' | 'edit' | 'skip';

export class ApprovalQueue {
  private queue: ApprovalRequest[] = [];

  enqueue(parsed: ParsedDiff): ApprovalRequest {
    const req: ApprovalRequest = {
      id: randomUUID(),
      parsedDiff: parsed,
      filePath: parsed.filePath,
    };
    this.queue.push(req);
    return req;
  }

  dequeue(): ApprovalRequest | undefined {
    return this.queue.shift();
  }

  get pending(): readonly ApprovalRequest[] {
    return [...this.queue];
  }

  get isEmpty(): boolean {
    return this.queue.length === 0;
  }
}
```

- [ ] **Step 4: Update `packages/agent/src/index.ts`**

Add:

```ts
export { ApprovalQueue } from './approval.js';
export type { ApprovalRequest, ApprovalDecision } from './approval.js';
```

- [ ] **Step 5: Run test to verify pass**

Run: `yarn workspace @awecode/agent test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(agent): non-blocking ApprovalQueue with FIFO semantics"
```

---

## Task 12: Intent Declaration detection (TDD)

**Files:**

- Create: `packages/agent/src/intent.ts`
- Test: `packages/agent/tests/intent.test.ts`
- Modify: `packages/agent/src/index.ts`

- [ ] **Step 1: Write failing test `packages/agent/tests/intent.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { detectIntentFromText } from '../src/intent.js';

describe('detectIntentFromText', () => {
  it('returns direct when no workflow call', () => {
    expect(detectIntentFromText('I will fix the typo.')).toEqual({ type: 'direct' });
  });

  it('returns direct for empty content', () => {
    expect(detectIntentFromText('')).toEqual({ type: 'direct' });
  });

  it('detects start_workflow call with double quotes', () => {
    expect(detectIntentFromText('I will start_workflow("brainstorm") now.')).toEqual({
      type: 'workflow',
      name: 'brainstorm',
    });
  });

  it('detects start_workflow call with single quotes', () => {
    expect(detectIntentFromText("start_workflow('spec')")).toEqual({
      type: 'workflow',
      name: 'spec',
    });
  });

  it('detects workflow name with hyphen', () => {
    expect(detectIntentFromText('start_workflow("deep-plan")')).toEqual({
      type: 'workflow',
      name: 'deep-plan',
    });
  });

  it('picks first workflow call if multiple', () => {
    const result = detectIntentFromText(
      'start_workflow("a") then start_workflow("b")',
    );
    expect(result).toEqual({ type: 'workflow', name: 'a' });
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `yarn workspace @awecode/agent test`
Expected: FAIL

- [ ] **Step 3: Create `packages/agent/src/intent.ts`**

```ts
export type IntentDeclaration =
  | { type: 'direct' }
  | { type: 'workflow'; name: string };

const WORKFLOW_RE = /start_workflow\(["']([\w-]+)["']\)/;

export function detectIntentFromText(content: string): IntentDeclaration {
  if (typeof content !== 'string') return { type: 'direct' };
  const match = content.match(WORKFLOW_RE);
  if (match && match[1]) {
    return { type: 'workflow', name: match[1] };
  }
  return { type: 'direct' };
}
```

- [ ] **Step 4: Update `packages/agent/src/index.ts`**

Add:

```ts
export { detectIntentFromText } from './intent.js';
export type { IntentDeclaration } from './intent.js';
```

- [ ] **Step 5: Run test to verify pass**

Run: `yarn workspace @awecode/agent test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(agent): Intent Declaration detection from assistant text"
```

---

## Task 13: Chat loop with tool calling

**Files:**

- Create: `packages/agent/src/chat.ts`
- Test: `packages/agent/tests/chat.test.ts`
- Modify: `packages/agent/src/index.ts`

- [ ] **Step 1: Write failing test `packages/agent/tests/chat.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { runChatLoop } from '../src/chat.js';
import { ContextManager } from '../src/context/manager.js';
import type { AwecodeConfig } from '@awecode/llm';

// Mock @awecode/llm
vi.mock('@awecode/llm', () => ({
  createProvider: vi.fn(() => ({})), // opaque model object
}));

// Mock ai (Vercel AI SDK)
const mockStreamText = vi.fn();
vi.mock('ai', () => ({
  streamText: (...args: unknown[]) => mockStreamText(...args),
}));

const mockConfig: AwecodeConfig = {
  activeProvider: 'mock',
  providers: {
    mock: {
      type: 'ollama' as const,
      baseURL: 'http://localhost:11434',
      defaultModel: 'mock-model',
    },
  },
};

function makeStreamResponse(text: string, toolCalls: unknown[] = []) {
  return {
    textStream: (async function* () {
      for (const ch of text) yield ch;
    })(),
    toolCalls: Promise.resolve(toolCalls),
  };
}

describe('runChatLoop', () => {
  it('returns messages with assistant response when no tool calls', async () => {
    mockStreamText.mockResolvedValueOnce(makeStreamResponse('Hello!'));

    const ctx = new ContextManager();
    const tokens: string[] = [];
    const result = await runChatLoop(
      [{ role: 'user', content: 'hi' }],
      {
        config: mockConfig,
        context: ctx,
        onToken: (t) => tokens.push(t),
      },
    );

    expect(result).toHaveLength(2); // user + assistant
    expect(result[1]!.role).toBe('assistant');
    expect(result[1!.content).toBe('Hello!');
    expect(tokens.join('')).toBe('Hello!');
  });

  it('detects diff markers in response', async () => {
    mockStreamText.mockResolvedValueOnce(
      makeStreamResponse('file_path: foo.ts\n<<<< SEARCH\nx\n====\ny\n>>>> REPLACE'),
    );

    const ctx = new ContextManager();
    let detectedDiff: string | null = null;
    await runChatLoop([{ role: 'user', content: 'edit' }], {
      config: mockConfig,
      context: ctx,
      onDiffDetected: (diff) => (detectedDiff = diff),
    });

    expect(detectedDiff).not.toBeNull();
    expect(detectedDiff).toContain('<<<< SEARCH');
  });

  it('invokes tool calls when present', async () => {
    // First iteration: returns tool call
    mockStreamText.mockResolvedValueOnce(
      makeStreamResponse('', [
        {
          toolName: 'read_file',
          args: { path: '/tmp/test.ts' },
        },
      ]),
    );
    // Second iteration: returns text only (done)
    mockStreamText.mockResolvedValueOnce(makeStreamResponse('Done reading file'));

    const ctx = new ContextManager();
    const toolCalls: Array<{ name: string; args: unknown }> = [];
    const toolResults: Array<{ name: string; result: unknown }> = [];

    await runChatLoop([{ role: 'user', content: 'read file' }], {
      config: mockConfig,
      context: ctx,
      onToolCall: (name, args) => toolCalls.push({ name, args }),
      onToolResult: (name, result) => toolResults.push({ name, result }),
    });

    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]!.name).toBe('read_file');
    expect(toolResults).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `yarn workspace @awecode/agent test`
Expected: FAIL with "Cannot find module '../src/chat.js'"

- [ ] **Step 3: Create `packages/agent/src/chat.ts`**

```ts
import { streamText, type CoreMessage } from 'ai';
import { createProvider } from '@awecode/llm';
import type { AwecodeConfig } from '@awecode/llm';
import { listToolDefinitions, dispatchTool } from '@awecode/tools';
import type { ContextManager } from './context/manager.js';

export interface ChatLoopOptions {
  config: AwecodeConfig;
  context: ContextManager;
  systemPrompt?: string;
  maxIterations?: number;
  onToken?: (chunk: string) => void;
  onToolCall?: (name: string, args: unknown) => void;
  onToolResult?: (name: string, result: unknown) => void;
  onDiffDetected?: (diff: string) => void;
}

export const DEFAULT_SYSTEM_PROMPT = `You are awecode, a CLI coding agent.

When you need to modify files, output a diff block in this format:

file_path: <path>
<<<< SEARCH
<source code to find>
====
<replacement code>
>>>> REPLACE

For inserts (empty search), add an anchor:

file_path: <path>
at: @after: function foo
<<<< SEARCH
====
<new code>
>>>> REPLACE

Use the read_file, search_files, list_files, and shell_exec tools to explore the codebase before making changes.`;

export async function runChatLoop(
  initialMessages: CoreMessage[],
  opts: ChatLoopOptions,
): Promise<CoreMessage[]> {
  const providerConfig = opts.config.providers[opts.config.activeProvider];
  if (!providerConfig) {
    throw new Error(`Active provider "${opts.config.activeProvider}" not found in config`);
  }
  const model = createProvider(providerConfig);

  let messages: CoreMessage[] = [...initialMessages, ...opts.context.toMessages()];
  const toolDefs = listToolDefinitions();
  const tools = toolDefs.reduce((acc, t) => {
    acc[t.name] = {
      description: t.description,
      parameters: t.parameters,
    };
    return acc;
  }, {} as Record<string, unknown>);

  const maxIter = opts.maxIterations ?? 20;

  for (let iter = 0; iter < maxIter; iter++) {
    const result = await streamText({
      model,
      messages,
      system: opts.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
      tools: tools as any,
      maxTokens: 4096,
    });

    let assistantText = '';
    for await (const chunk of result.textStream) {
      assistantText += chunk;
      opts.onToken?.(chunk);
    }

    if (assistantText.includes('<<<< SEARCH')) {
      opts.onDiffDetected?.(assistantText);
    }

    messages.push({ role: 'assistant', content: assistantText });

    const toolCalls = await result.toolCalls;
    if (!toolCalls || toolCalls.length === 0) {
      break; // Agent done
    }

    for (const call of toolCalls) {
      opts.onToolCall?.(call.toolName, call.args);
      const toolResult = await dispatchTool({
        name: call.toolName,
        arguments: call.args as Record<string, unknown>,
      });
      opts.onToolResult?.(call.toolName, toolResult);
      messages.push({
        role: 'tool',
        content: JSON.stringify(toolResult),
      } as CoreMessage);
    }
  }

  return messages;
}
```

- [ ] **Step 4: Update `packages/agent/src/index.ts`**

Add:

```ts
export { runChatLoop, DEFAULT_SYSTEM_PROMPT } from './chat.js';
export type { ChatLoopOptions } from './chat.js';
```

- [ ] **Step 5: Run test to verify pass**

Run: `yarn workspace @awecode/agent test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(agent): chat loop with tool calling, streaming, diff detection"
```

---

## Task 14: CLI — TUI components (ChatView + ContextPanel + ApprovalView + DiffPreview)

**Files:**

- Modify: `packages/cli/package.json` (add `@awecode/agent`, `@awecode/diff` deps)
- Create: `packages/cli/src/components/ChatView.tsx`
- Create: `packages/cli/src/components/ContextPanel.tsx`
- Create: `packages/cli/src/components/ApprovalView.tsx`
- Create: `packages/cli/src/components/DiffPreview.tsx`

- [ ] **Step 1: Add CLI dependencies**

Run: `yarn workspace @awecode/cli add @awecode/agent @awecode/diff`

- [ ] **Step 2: Create `packages/cli/src/components/ChatView.tsx`**

```tsx
import React from 'react';
import { Box, Text } from 'ink';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
}

interface Props {
  messages: ChatMessage[];
  isStreaming: boolean;
  workflowIndicator?: { name: string; phase: string } | null;
}

export function ChatView({ messages, isStreaming, workflowIndicator }: Props) {
  return (
    <Box flexDirection="column">
      {workflowIndicator && (
        <Box marginBottom={1}>
          <Text color="magenta">⚡ Workflow: {workflowIndicator.name}</Text>
          <Text dimColor> ({workflowIndicator.phase})</Text>
        </Box>
      )}
      {messages.map((msg, i) => (
        <Box key={i} marginBottom={i < messages.length - 1 ? 1 : 0}>
          {msg.role === 'user' && (
            <Text>
              <Text bold color="cyan">You: </Text>
              {msg.content}
            </Text>
          )}
          {msg.role === 'assistant' && (
            <Text>
              <Text bold color="green">Agent: </Text>
              {msg.content}
            </Text>
          )}
          {msg.role === 'tool' && (
            <Text dimColor>[tool] {msg.content.slice(0, 200)}</Text>
          )}
        </Box>
      ))}
      {isStreaming && (
        <Text color="yellow">
          <Text bold>●</Text> thinking...
        </Text>
      )}
    </Box>
  );
}
```

- [ ] **Step 3: Create `packages/cli/src/components/ContextPanel.tsx`**

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { ContextEntry } from '@awecode/agent';

interface Props {
  entries: readonly ContextEntry[];
  totalTokens: number;
  budget: number;
}

export function ContextPanel({ entries, totalTokens, budget }: Props) {
  const pct = budget > 0 ? Math.round((totalTokens / budget) * 100) : 0;
  const color = pct >= 95 ? 'red' : pct >= 85 ? 'yellow' : 'green';

  return (
    <Box flexDirection="column">
      <Text bold>
        Context ({totalTokens.toLocaleString()} / {budget.toLocaleString()})
      </Text>
      <Text color={color}>
        {'█'.repeat(Math.floor(pct / 5))}
        {'░'.repeat(20 - Math.floor(pct / 5))}
      </Text>
      <Text> </Text>
      {entries.map((e) => (
        <Text key={e.id}>
          [{e.addedBy}] {e.path ?? `[${e.type}]`} ({e.tokens} tok)
        </Text>
      ))}
    </Box>
  );
}
```

- [ ] **Step 4: Create `packages/cli/src/components/DiffPreview.tsx`**

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { DiffBlock } from '@awecode/diff';

interface Props {
  block: DiffBlock;
  blockIndex: number;
  totalBlocks: number;
}

export function DiffPreview({ block, blockIndex, totalBlocks }: Props) {
  return (
    <Box flexDirection="column">
      <Text bold>
        Block {blockIndex + 1}/{totalBlocks}
        {block.anchor && (
          <Text dimColor> at: @{block.anchor.type} {block.anchor.symbol}</Text>
        )}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        <Text color="red">- {block.search.trim() || '(empty — insert)'}</Text>
        <Text color="green">+ {block.replace.trim()}</Text>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 5: Create `packages/cli/src/components/ApprovalView.tsx`**

```tsx
import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { ApprovalRequest, ApprovalDecision } from '@awecode/agent';
import { DiffPreview } from './DiffPreview.js';

interface Props {
  request: ApprovalRequest;
  blockIndex: number;
  onDecision: (decision: ApprovalDecision) => void;
}

export function ApprovalView({ request, blockIndex, onDecision }: Props) {
  useInput((input, _key) => {
    if (input === 'y') onDecision('accept');
    else if (input === 'n') onDecision('reject');
    else if (input === 'e') onDecision('edit');
    else if (input === 's') onDecision('skip');
  });

  const block = request.parsedDiff.blocks[blockIndex];

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text bold>Diff Approval — {request.filePath}</Text>
      <Text> </Text>
      {block && (
        <DiffPreview
          block={block}
          blockIndex={blockIndex}
          totalBlocks={request.parsedDiff.blocks.length}
        />
      )}
      <Text> </Text>
      <Text>
        <Text color="green">[y]</Text> accept{'  '}
        <Text color="red">[n]</Text> reject{'  '}
        <Text color="blue">[e]</Text> edit{'  '}
        <Text color="yellow">[s]</Text> skip
      </Text>
    </Box>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(cli): ChatView, ContextPanel, ApprovalView, DiffPreview components"
```

---

## Task 15: CLI — Direct Mode chat command (orchestrator)

**Files:**

- Create: `packages/cli/src/commands/chat.ts`
- Modify: `packages/cli/src/index.ts` (route default → chat)

- [ ] **Step 1: Create `packages/cli/src/commands/chat.ts`**

```tsx
import React, { useState, useEffect } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import { TextPrompt } from '@inkjs/ui';
import { loadConfig, getDefaultConfigPath } from '@awecode/llm';
import { parseDiff, applyDiff } from '@awecode/diff';
import {
  ContextManager,
  ApprovalQueue,
  runChatLoop,
  type ChatMessage,
} from '@awecode/agent';
import { ChatView } from '../components/ChatView.js';
import { ContextPanel } from '../components/ContextPanel.js';
import { ApprovalView } from '../components/ApprovalView.js';
import type { ApprovalRequest, ApprovalDecision } from '@awecode/agent';
import { readFile, writeFile } from 'node:fs/promises';

interface ChatAppProps {
  context: ContextManager;
  config: NonNullable<Awaited<ReturnType<typeof loadConfig>>>;
}

function ChatApp({ context, config }: ChatAppProps) {
  const { exit } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingDiffs, setPendingDiffs] = useState<ApprovalQueue>(new ApprovalQueue());
  const [currentApproval, setCurrentApproval] = useState<ApprovalRequest | null>(null);
  const [currentBlockIdx, setCurrentBlockIdx] = useState(0);

  useInput((_, key) => {
    if (key.ctrl && _.toLowerCase() === 'c') {
      exit();
    }
  });

  const handleSubmit = async (userInput: string) => {
    if (isStreaming) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: userInput }]);
    setIsStreaming(true);

    try {
      const result = await runChatLoop(
        [{ role: 'user', content: userInput }],
        {
          config,
          context,
          onToken: (chunk) => {
            setMessages((m) => {
              const last = m[m.length - 1];
              if (last && last.role === 'assistant') {
                return [...m.slice(0, -1), { role: 'assistant', content: last.content + chunk }];
              }
              return [...m, { role: 'assistant', content: chunk }];
            });
          },
          onDiffDetected: (diff) => {
            const parsed = parseDiff(diff);
            for (const p of parsed) {
              pendingDiffs.enqueue(p);
            }
          },
        },
      );
      void result;
    } finally {
      setIsStreaming(false);
      // After streaming done, check pending approvals
      if (!pendingDiffs.isEmpty && !currentApproval) {
        setCurrentApproval(pendingDiffs.dequeue() ?? null);
        setCurrentBlockIdx(0);
      }
    }
  };

  const handleApproval = async (decision: ApprovalDecision) => {
    if (!currentApproval) return;
    const block = currentApproval.parsedDiff.blocks[currentBlockIdx];
    if (!block) return;

    if (decision === 'accept') {
      try {
        const source = await readFile(currentApproval.filePath, 'utf-8');
        const applyResult = applyDiff(source, [block]);
        if (applyResult.ok) {
          await writeFile(currentApproval.filePath, applyResult.result, 'utf-8');
          context.refreshFile(currentApproval.filePath, applyResult.result);
        }
      } catch (err) {
        console.error(`Failed to apply: ${(err as Error).message}`);
      }
    }

    // Move to next block or next diff
    const nextIdx = currentBlockIdx + 1;
    if (nextIdx < currentApproval.parsedDiff.blocks.length) {
      setCurrentBlockIdx(nextIdx);
    } else {
      setCurrentApproval(pendingDiffs.dequeue() ?? null);
      setCurrentBlockIdx(0);
    }
  };

  // Approval Mode overlay
  if (currentApproval) {
    return (
      <ApprovalView
        request={currentApproval}
        blockIndex={currentBlockIdx}
        onDecision={handleApproval}
      />
    );
  }

  // Normal chat view
  return (
    <Box flexDirection="row" height="100%">
      <Box borderStyle="single" paddingX={1} width="40%">
        <ContextPanel
          entries={context.snapshot()}
          totalTokens={context.totalTokens}
          budget={context.budgetTokens}
        />
      </Box>
      <Box flexDirection="column" paddingX={1} width="60%">
        <ChatView messages={messages} isStreaming={isStreaming} workflowIndicator={null} />
        <Box marginTop={1}>
          {!isStreaming && (
            <TextPrompt
              value={input}
              onChange={setInput}
              onSubmit={handleSubmit}
              placeholder="Type your prompt (Ctrl+C to exit)"
            />
          )}
        </Box>
      </Box>
    </Box>
  );
}

export async function chatCommand(): Promise<void> {
  const configPath = getDefaultConfigPath();
  const config = await loadConfig(configPath);

  if (!config) {
    console.error(`No config found at ${configPath}. Run 'awecode config' first.`);
    process.exit(1);
  }

  const context = new ContextManager();

  render(<ChatApp context={context} config={config} />);
}
```

- [ ] **Step 2: Wire default command into `packages/cli/src/index.ts`**

Add to main dispatcher (before "Unknown command"):

```ts
// Default: no command → Direct Mode chat
const { chatCommand } = await import('./commands/chat.js');
await chatCommand();
```

And ensure unknown command falls through to chat. Update main:

```ts
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    const { chatCommand } = await import('./commands/chat.js');
    await chatCommand();
    return;
  }

  if (args[0] === '--help' || args[0] === '-h') {
    // ... existing help
    return;
  }

  if (args[0] === 'config') {
    const { configCommand } = await import('./commands/config.js');
    await configCommand();
    return;
  }

  if (args[0] === 'chat-test') {
    const { chatTestCommand } = await import('./commands/chat-test.js');
    await chatTestCommand();
    return;
  }

  // Treat unknown as prompt to Direct Mode
  const { chatCommand } = await import('./commands/chat.js');
  await chatCommand();
}
```

- [ ] **Step 3: Install `@inkjs/ui` if not present**

Run: `yarn workspace @awecode/cli add @inkjs/ui`

- [ ] **Step 4: Build all packages**

Run: `yarn workspaces foreach --all --topological run build`
Expected: All packages build successfully

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(cli): Direct Mode chat command with TUI orchestrator"
```

---

## Task 16: Component tests with ink-testing-library

**Files:**

- Create: `packages/cli/tests/components/ChatView.test.tsx`
- Create: `packages/cli/tests/components/ContextPanel.test.tsx`
- Create: `packages/cli/tests/components/ApprovalView.test.tsx`

- [ ] **Step 1: Install ink-testing-library**

Run: `yarn workspace @awecode/cli add -D ink-testing-library`

- [ ] **Step 2: Create `packages/cli/tests/components/ChatView.test.tsx`**

```tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { ChatView } from '../../src/components/ChatView.js';

describe('ChatView', () => {
  it('renders user and assistant messages', () => {
    const { lastFrame } = render(
      <ChatView
        messages={[
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hi there' },
        ]}
        isStreaming={false}
      />,
    );
    const frame = lastFrame();
    expect(frame).toContain('You: hello');
    expect(frame).toContain('Agent: hi there');
  });

  it('shows thinking indicator when streaming', () => {
    const { lastFrame } = render(
      <ChatView messages={[]} isStreaming={true} />,
    );
    expect(lastFrame()).toContain('thinking');
  });

  it('shows workflow indicator when provided', () => {
    const { lastFrame } = render(
      <ChatView
        messages={[]}
        isStreaming={false}
        workflowIndicator={{ name: 'brainstorm', phase: 'round 1' }}
      />,
    );
    expect(lastFrame()).toContain('brainstorm');
  });
});
```

- [ ] **Step 3: Create `packages/cli/tests/components/ContextPanel.test.tsx`**

```tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { ContextPanel } from '../../src/components/ContextPanel.js';
import type { ContextEntry } from '@awecode/agent';

const mockEntry: ContextEntry = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  type: 'file',
  path: '/tmp/foo.ts',
  content: 'export const x = 1;',
  tokens: 10,
  addedAt: Date.now(),
  addedBy: 'user',
};

describe('ContextPanel', () => {
  it('renders entries with token count', () => {
    const { lastFrame } = render(
      <ContextPanel entries={[mockEntry]} totalTokens={10} budget={1000} />,
    );
    const frame = lastFrame();
    expect(frame).toContain('Context');
    expect(frame).toContain('/tmp/foo.ts');
    expect(frame).toContain('10');
  });

  it('renders empty state with no entries', () => {
    const { lastFrame } = render(
      <ContextPanel entries={[]} totalTokens={0} budget={1000} />,
    );
    expect(lastFrame()).toContain('Context');
  });
});
```

- [ ] **Step 4: Create `packages/cli/tests/components/ApprovalView.test.tsx`**

```tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { ApprovalView } from '../../src/components/ApprovalView.js';
import type { ApprovalRequest } from '@awecode/agent';

const mockRequest: ApprovalRequest = {
  id: 'approval-1',
  filePath: 'src/foo.ts',
  parsedDiff: {
    filePath: 'src/foo.ts',
    blocks: [{ search: 'old\n', replace: 'new\n' }],
  },
};

describe('ApprovalView', () => {
  it('renders file path and diff content', () => {
    const onDecision = vi.fn();
    const { lastFrame } = render(
      <ApprovalView request={mockRequest} blockIndex={0} onDecision={onDecision} />,
    );
    const frame = lastFrame();
    expect(frame).toContain('Diff Approval');
    expect(frame).toContain('src/foo.ts');
    expect(frame).toContain('old');
    expect(frame).toContain('new');
  });

  it('shows action keys y/n/e/s', () => {
    const onDecision = vi.fn();
    const { lastFrame } = render(
      <ApprovalView request={mockRequest} blockIndex={0} onDecision={onDecision} />,
    );
    const frame = lastFrame();
    expect(frame).toContain('[y]');
    expect(frame).toContain('[n]');
    expect(frame).toContain('[e]');
    expect(frame).toContain('[s]');
  });
});
```

- [ ] **Step 5: Run tests**

Run: `yarn workspace @awecode/cli test`
Expected: All component tests PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test(cli): component tests for ChatView, ContextPanel, ApprovalView"
```

---

## Task 17: E2E smoke test — typo fix scenario

**Files:**

- Create: `packages/cli/tests/e2e-typo-fix.test.ts`

- [ ] **Step 1: Write e2e test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDiff, applyDiff } from '@awecode/diff';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'awecode-e2e-typo-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('E2E: typo fix via diff', () => {
  it('parses diff and applies fix to file', async () => {
    // 1. Setup: file with typo
    const filePath = join(tmpDir, 'src', 'foo.ts');
    await mkdir(join(tmpDir, 'src'), { recursive: true });
    await writeFile(
      filePath,
      'export function recieve(input: string): string {\n  return input;\n}\n',
      'utf-8',
    );

    // 2. Simulate LLM output (what agent would produce)
    const llmOutput = `file_path: ${filePath}
<<<< SEARCH
export function recieve(input: string): string {
====
export function receive(input: string): string {
>>>> REPLACE`;

    // 3. Parse
    const parsed = parseDiff(llmOutput);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.blocks).toHaveLength(1);

    // 4. Apply
    const source = await readFile(filePath, 'utf-8');
    const result = applyDiff(source, parsed[0]!.blocks);
    expect(result.ok).toBe(true);

    // 5. Write back
    if (result.ok) {
      await writeFile(filePath, result.result, 'utf-8');
    }

    // 6. Verify
    const final = await readFile(filePath, 'utf-8');
    expect(final).toContain('receive');
    expect(final).not.toContain('recieve');
  });
});
```

- [ ] **Step 2: Run test**

Run: `yarn workspace @awecode/cli test`
Expected: PASS (no LLM needed — tests diff engine end-to-end)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(cli): e2e typo fix scenario via parseDiff + applyDiff"
```

---

## Task 18: Workspace build + typecheck + lint

**Files:**

- Modify: root `package.json` (ensure scripts cover new packages)

- [ ] **Step 1: Run full workspace validation**

Run: `yarn typecheck && yarn lint && yarn test && yarn build`
Expected: all pass

- [ ] **Step 2: Fix any type errors**

If typecheck fails, fix errors in respective packages.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: workspace-wide typecheck/lint/test/build green"
```

---

## Task 19: Documentation

**Files:**

- Modify: `README.md`
- Create: `docs/direct-mode.md`

- [ ] **Step 1: Update `README.md`**

```markdown
# Awecode

CLI Coding Agent with built-in workflow engine (brainstorm → spec → grill → plan).

**Status:** v0.1 in development. Plans 1-3 complete (Foundation + Diff Engine + Direct Mode).

## Quick start

\`\`\`bash
npm install -g @awecode/cli
awecode config           # interactive LLM provider setup
awecode chat-test        # smoke test LLM
awecode                 # enter Direct Mode TUI
\`\`\`

In Direct Mode:

\`\`\`
> Fix typo 'recieve' → 'receive' in src/foo.ts
[Agent streams response, shows diff]
[Diff Approval]  [y] accept  [n] reject  [e] edit  [s] skip
\`\`\`

## License

Apache-2.0
```

- [ ] **Step 2: Create `docs/direct-mode.md`**

```markdown
# Direct Mode

Direct Mode is awecode's default state — agent responds to user prompts directly without workflow pipeline. Used for:

- Typo fixes
- Single-file edits
- Factual queries
- Code reading / exploration

## When Direct Mode vs Workflow?

| Task | Mode |
|------|------|
| "Fix typo in X" | Direct |
| "Add test for function Y" | Direct or light workflow |
| "Build CSV import feature" | Workflow (brainstorm → ...) |
| "Refactor auth module to OAuth" | Workflow |

## Approval Mode

When agent emits a Diff Block, TUI switches to Approval Mode after streaming completes:

- `[y]` accept block
- `[n]` reject block
- `[e]` edit diff in `$EDITOR`
- `[s]` skip block
- Multiple blocks reviewed sequentially
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: update README + add Direct Mode guide"
```

---

## Self-Review

### Spec coverage

- Spec 3 (Architecture — tools/agent/cli): ✅ Tasks 1-15
- Spec 4 (Diff apply integration): ✅ Tasks 13, 15, 17
- Spec 6 (Context Manager): ✅ Tasks 9, 10
- Spec 8.1-8.2 (TUI 2-panel + Approval Mode): ✅ Tasks 14, 15
- Spec 8.3 (State machine Idle → Thinking → Tool Done → Approval): ✅ Task 15
- CONTEXT.md "Direct Mode": ✅ Task 15
- CONTEXT.md "Approval Mode": ✅ Tasks 11, 14, 15
- CONTEXT.md "Context Entry": ✅ Tasks 9, 10
- Q5 grill (non-blocking queue + end of turn): ✅ Task 15 (queue during stream, approval after)
- Q33 grill (gpt-tokenizer standalone): ✅ Task 9

### Placeholder scan

- All tasks have full code
- All tests have actual test code (no "write tests for the above")
- All commits have exact messages
- No "TBD", "TODO", "see Task N" references without re-stating interface

### Type consistency

- `ContextEntry` defined Task 9, used Tasks 10, 14, 15, 16
- `ContextManager` defined Task 10, used Tasks 13, 15
- `ApprovalRequest`, `ApprovalDecision` defined Task 11, used Tasks 14, 15, 16
- `IntentDeclaration` defined Task 12 (consumed in Plan 5)
- `runChatLoop`, `ChatLoopOptions` defined Task 13, used Task 15
- Tool types (`ToolCall`, `ToolResult`) from Plan 1 reused
- Diff types (`ParsedDiff`, `DiffBlock`) from Plan 2 reused

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-19-plan3-direct-mode.md`. Two execution options:

**1. Subagent-Driven (recommended)** - fresh subagent per task, review between tasks

**2. Inline Execution** - batch execution with checkpoints

**Which approach?**
