# Awecode Plan 3: Direct Mode (Chat Loop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Build `@awecode/agent` core + `@awecode/tools` (file ops, shell, grep) — Direct Mode chat loop where user can submit a prompt, agent calls tools, applies Diff Blocks, user reviews in Approval Mode.

**Architecture:** Agent owns chat loop + Context Manager + Approval Gate. Tools are pure functions exposed via tool calling schema. No Workflow Engine yet (that's Plan 5). CLI renders chat in Direct Mode only — minimal 2-panel layout (chat + context).

**Tech Stack:** TypeScript, Vercel AI SDK (from Plan 1), `@awecode/diff` (from Plan 2), `fast-glob` for glob, `node:fs/promises`, `child_process.spawn` for shell.

## Global Constraints

(Same as Plan 1)

**References:**

- Spec sections 3, 4 (apply), 6 (Context), 8 (TUI Direct Mode), 10
- CONTEXT.md: Task, Direct Mode, Approval Mode, Context Entry
- Q5 grill: non-blocking approval queue

---

## File Structure

```
packages/
├── tools/
│   ├── src/
│   │   ├── index.ts
│   │   ├── types.ts          # Tool interface
│   │   ├── file/
│   │   │   ├── read.ts       # read_file
│   │   │   ├── write.ts      # write_file (via diff)
│   │   │   ├── list.ts       # list_files (glob)
│   │   │   └── search.ts     # grep / search_files
│   │   └── shell/
│   │       └── exec.ts       # shell_exec (with platform normalize)
│   └── tests/
├── agent/
│   ├── src/
│   │   ├── index.ts
│   │   ├── types.ts          # Task, Message, ToolCall
│   │   ├── context/
│   │   │   ├── manager.ts    # ContextManager
│   │   │   └── entry.ts      # ContextEntry ops
│   │   ├── chat.ts           # chat loop
│   │   ├── tools.ts          # tool dispatcher
│   │   └── approval.ts       # Approval queue
│   └── tests/
└── cli/
    └── src/
        ├── components/
        │   ├── ChatView.tsx
        │   ├── ContextPanel.tsx
        │   ├── ApprovalView.tsx
        │   └── DiffPreview.tsx
        └── commands/
            └── chat.ts       # default command (Direct Mode TUI)
```

---

## Task 1: `@awecode/tools` package skeleton + types

**Files:**

- Create: `packages/tools/package.json`, `tsconfig.json`
- Create: `packages/tools/src/types.ts` — `Tool`, `ToolCall`, `ToolResult`
- Test: sanity

**Key code:**

```ts
// packages/tools/src/types.ts
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON schema
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export type ToolResult =
  | { ok: true; output: string; contextEntries?: ContextEntryPayload[] }
  | { ok: false; error: string };

export interface ContextEntryPayload {
  type: 'file' | 'command-output' | 'snippet';
  path?: string;
  content: string;
}
```

- [ ] Standard 5-step TDD cycle for the type file
- [ ] Commit: `feat(tools): scaffold package with Tool type definitions`

---

## Task 2: read_file tool (TDD)

**Files:**

- `packages/tools/src/file/read.ts`
- Test: `tests/read.test.ts`

**Behavior:**

- Input: `{ path: string, lines?: { start, end } }`
- Output: file content (full or partial)
- Error: file not found, binary file

```ts
import { readFile, stat } from 'node:fs/promises';

export async function readFileTool(args: { path: string; lines?: { start: number; end: number } }): Promise<ToolResult> {
  try {
    const content = await readFile(args.path, 'utf-8');
    const lines = content.split('\n');
    if (args.lines) {
      const sliced = lines.slice(args.lines.start - 1, args.lines.end).join('\n');
      return { ok: true, output: sliced, contextEntries: [{ type: 'file', path: args.path, content: sliced }] };
    }
    return { ok: true, output: content, contextEntries: [{ type: 'file', path: args.path, content }] };
  } catch (err) {
    return { ok: false, error: `Failed to read ${args.path}: ${(err as Error).message}` };
  }
}

export const readFileDef: ToolDefinition = {
  name: 'read_file',
  description: 'Read content of a file, optionally limited to a line range',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute or relative file path' },
      lines: {
        type: 'object',
        properties: {
          start: { type: 'number' },
          end: { type: 'number' },
        },
      },
    },
    required: ['path'],
  },
};
```

- [ ] Tests for: read full file, read partial, file not found, empty file
- [ ] Commit: `feat(tools): add read_file tool with optional line range`

---

## Task 3: list_files (glob) tool

**Files:**

- `packages/tools/src/file/list.ts`

**Behavior:** Use `fast-glob` to list files matching pattern, exclude `.awecode/`, `node_modules/`, `.git/`.

```ts
import fastGlob from 'fast-glob';

const DEFAULT_IGNORE = ['**/node_modules/**', '**/.git/**', '**/.awecode/**'];

export async function listFilesTool(args: { pattern: string; cwd?: string }): Promise<ToolResult> {
  const files = await fastGlob(args.pattern, {
    cwd: args.cwd ?? process.cwd(),
    ignore: DEFAULT_IGNORE,
    dot: false,
  });
  return { ok: true, output: files.join('\n') };
}
```

- [ ] Install: `yarn workspace @awecode/tools add fast-glob`
- [ ] Tests for: list .ts files, ignore node_modules, no matches
- [ ] Commit: `feat(tools): add list_files tool with glob patterns`

---

## Task 4: search_files (grep) tool

**Files:**

- `packages/tools/src/file/search.ts`

**Behavior:** Use `execFile` to call `rg` (ripgrep) if available, fallback to JS regex scan. Returns matching lines with file:line:content format.

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import fastGlob from 'fast-glob';

const execFileAsync = promisify(execFile);

export async function searchFilesTool(args: { pattern: string; path?: string; glob?: string }): Promise<ToolResult> {
  const cwd = args.path ?? process.cwd();
  try {
    const { stdout } = await execFileAsync('rg', [
      '--line-number', '--no-heading', '--color=never',
      args.pattern, cwd,
    ]);
    return { ok: true, output: stdout };
  } catch {
    // Fallback: JS scan
    const files = await fastGlob(args.glob ?? '**/*.{ts,tsx,js,jsx,py,go,rs}', { cwd });
    const matches: string[] = [];
    const re = new RegExp(args.pattern);
    for (const f of files.slice(0, 100)) {
      const content = await readFile(`${cwd}/${f}`, 'utf-8');
      content.split('\n').forEach((line, i) => {
        if (re.test(line)) matches.push(`${f}:${i + 1}:${line}`);
      });
    }
    return { ok: true, output: matches.join('\n') };
  }
}
```

- [ ] Tests for: simple regex, no matches, fallback path
- [ ] Commit: `feat(tools): add search_files with ripgrep primary, JS fallback`

---

## Task 5: shell_exec tool with cross-platform normalize

**Files:**

- `packages/tools/src/shell/exec.ts`

**Behavior:** Cross-platform command execution. Windows → PowerShell, Unix → bash. Per Q12 grill.

```ts
import { spawn } from 'node:child_process';

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
  const shellArgs = isWin ? ['-NoProfile', '-Command', args.command] : ['-c', args.command];

  return new Promise((resolve) => {
    const child = spawn(shell, shellArgs, { cwd });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ ok: false, error: `Command timed out after ${timeout}ms` });
    }, timeout);

    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => {
      clearTimeout(timer);
      const output = stdout + (stderr ? `\n[stderr]\n${stderr}` : '');
      if (code === 0) {
        resolve({
          ok: true,
          output,
          contextEntries: [{ type: 'command-output', content: output }],
        });
      } else {
        resolve({ ok: false, error: `Exit ${code}\n${output}` });
      }
    });
  });
}
```

- [ ] Tests for: simple echo (cross-platform), timeout, exit code propagation
- [ ] Commit: `feat(tools): add shell_exec with PowerShell/bash detection`

---

## Task 6: Tool registry + dispatcher

**Files:**

- `packages/tools/src/index.ts`

```ts
import { readFileTool, readFileDef } from './file/read.js';
import { listFilesTool, listFilesDef } from './file/list.js';
import { searchFilesTool, searchFilesDef } from './file/search.js';
import { shellExecTool, shellExecDef } from './shell/exec.js';
import type { ToolDefinition, ToolCall, ToolResult } from './types.js';

export const TOOL_REGISTRY: Record<string, { def: ToolDefinition; handler: (args: any) => Promise<ToolResult> }> = {
  [readFileDef.name]: { def: readFileDef, handler: readFileTool },
  [listFilesDef.name]: { def: listFilesDef, handler: listFilesTool },
  [searchFilesDef.name]: { def: searchFilesDef, handler: searchFilesTool },
  [shellExecDef.name]: { def: shellExecDef, handler: shellExecTool },
};

export function listToolDefinitions(): ToolDefinition[] {
  return Object.values(TOOL_REGISTRY).map((t) => t.def);
}

export async function dispatchTool(call: ToolCall): Promise<ToolResult> {
  const entry = TOOL_REGISTRY[call.name];
  if (!entry) return { ok: false, error: `Unknown tool: ${call.name}` };
  return entry.handler(call.arguments);
}

export type { ToolDefinition, ToolCall, ToolResult } from './types.js';
```

- [ ] Test: dispatch by name, unknown tool returns error
- [ ] Commit: `feat(tools): tool registry and dispatcher`

---

## Task 7: `@awecode/agent` package — Context Manager

**Files:**

- `packages/agent/src/context/manager.ts`

**Key types (from Plan 1 + spec section 6):**

```ts
import type { AwecodeConfig } from '@awecode/llm';
import { countTokens } from 'gpt-tokenizer';

export interface ContextEntry {
  id: string;
  type: 'file' | 'snippet' | 'command-output' | 'diff' | 'repo-map';
  path?: string;
  lines?: { start: number; end: number };
  content: string;
  tokens: number;
  addedAt: number;
  addedBy: 'user' | 'agent';
}

export class ContextManager {
  private entries: ContextEntry[] = [];
  private budget: number;

  constructor(budget: number = 100_000) {
    this.budget = budget;
  }

  addFile(path: string, content: string, lines?: { start: number; end: number }, addedBy: 'user' | 'agent' = 'agent'): ContextEntry {
    const entry: ContextEntry = {
      id: crypto.randomUUID(),
      type: 'file',
      path,
      lines,
      content,
      tokens: countTokens(content),
      addedAt: Date.now(),
      addedBy,
    };
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
    this.entries[idx] = {
      ...this.entries[idx]!,
      content: newContent,
      tokens: countTokens(newContent),
    };
  }

  get totalTokens(): number {
    return this.entries.reduce((sum, e) => sum + e.tokens, 0);
  }

  get utilization(): number {
    return this.totalTokens / this.budget;
  }

  snapshot(): readonly ContextEntry[] {
    return [...this.entries];
  }

  toMessages(): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    // Serialize entries to system message
    if (this.entries.length === 0) return [];
    const blocks = this.entries.map((e) => {
      const header = e.path ? `File: ${e.path}${e.lines ? ` (lines ${e.lines.start}-${e.lines.end})` : ''}` : `[${e.type}]`;
      return `--- ${header} ---\n${e.content}`;
    });
    return [{ role: 'system', content: `Context entries:\n\n${blocks.join('\n\n')}` }];
  }
}
```

- [ ] Install: `yarn workspace @awecode/agent add gpt-tokenizer`
- [ ] Tests for: addFile, removeEntry, refreshFile, totalTokens, toMessages
- [ ] Commit: `feat(agent): ContextManager with token tracking via gpt-tokenizer`

---

## Task 8: Chat loop with tool calling

**Files:**

- `packages/agent/src/chat.ts`

**Behavior:** Stream LLM response, dispatch tool calls, accumulate messages, detect when agent is "done".

```ts
import { streamText, type CoreMessage } from 'ai';
import { createProvider } from '@awecode/llm';
import { dispatchTool, listToolDefinitions } from '@awecode/tools';
import type { AwecodeConfig } from '@awecode/llm';
import { ContextManager } from './context/manager.js';

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

export async function runChatLoop(
  initialMessages: CoreMessage[],
  opts: ChatLoopOptions,
): Promise<CoreMessage[]> {
  const providerConfig = opts.config.providers[opts.config.activeProvider];
  if (!providerConfig) throw new Error('No active provider');
  const model = createProvider(providerConfig);

  let messages = [...initialMessages, ...opts.context.toMessages()];
  const tools = listToolDefinitions();
  const maxIter = opts.maxIterations ?? 20;

  for (let iter = 0; iter < maxIter; iter++) {
    const result = await streamText({
      model,
      messages,
      system: opts.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
      tools: tools.reduce((acc, t) => {
        acc[t.name] = { description: t.description, parameters: t.parameters };
        return acc;
      }, {} as Record<string, any>),
      maxTokens: 4096,
    });

    let assistantText = '';
    for await (const chunk of result.textStream) {
      assistantText += chunk;
      opts.onToken?.(chunk);
    }

    // Check for diff markers in response
    if (assistantText.includes('<<<< SEARCH')) {
      opts.onDiffDetected?.(assistantText);
    }

    messages.push({ role: 'assistant', content: assistantText });

    // Handle tool calls
    const toolCalls = await result.toolCalls;
    if (toolCalls.length === 0) {
      break; // Agent done
    }

    for (const call of toolCalls) {
      opts.onToolCall?.(call.toolName, call.args);
      const result2 = await dispatchTool({ name: call.toolName, arguments: call.args as Record<string, unknown> });
      opts.onToolResult?.(call.toolName, result2);
      messages.push({
        role: 'tool',
        content: JSON.stringify(result2),
      } as CoreMessage);
    }
  }

  return messages;
}

const DEFAULT_SYSTEM_PROMPT = `You are awecode, a CLI coding agent.

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
```

- [ ] Tests using mocked LLM (similar pattern to Plan 1 Task 6)
- [ ] Commit: `feat(agent): chat loop with tool calling and diff detection`

---

## Task 9: Approval queue (non-blocking, Q5 grill)

**Files:**

- `packages/agent/src/approval.ts`

```ts
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
      id: crypto.randomUUID(),
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

- [ ] Tests for enqueue, dequeue, FIFO order
- [ ] Commit: `feat(agent): non-blocking approval queue`

---

## Task 10: CLI Direct Mode TUI

**Files:**

- `packages/cli/src/commands/chat.ts`
- `packages/cli/src/components/{ChatView,ContextPanel,ApprovalView,DiffPreview}.tsx`

**Layout (per spec section 8.1):**

- Left panel: Context entries (read-only for v0.1)
- Right panel: Chat conversation + tool calls
- Bottom: Input

**Behavior:**

1. User types prompt → Enter
2. Agent streams response (visible in chat)
3. If diff detected → enqueue to ApprovalQueue
4. After stream ends → if queue not empty, switch to ApprovalView
5. User reviews each Diff Block (y/n/e/s/a/q)
6. Apply accepted blocks to working dir via `applyDiff`
7. Commit per task strategy (default per-task — see Plan 4)

**Key component: ApprovalView.tsx**

```tsx
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ApprovalRequest } from '@awecode/agent';

interface Props {
  request: ApprovalRequest;
  onDecision: (decision: 'accept' | 'reject' | 'edit' | 'skip') => void;
}

export function ApprovalView({ request, onDecision }: Props) {
  useInput((input) => {
    if (input === 'y') onDecision('accept');
    else if (input === 'n') onDecision('reject');
    else if (input === 'e') onDecision('edit');
    else if (input === 's') onDecision('skip');
  });

  return (
    <Box flexDirection="column" borderStyle="round">
      <Text bold>Diff Approval — {request.filePath}</Text>
      <Text> </Text>
      {request.parsedDiff.blocks.map((block, i) => (
        <Box key={i} flexDirection="column">
          <Text color="red">- {block.search}</Text>
          <Text color="green">+ {block.replace}</Text>
        </Box>
      ))}
      <Text> </Text>
      <Text>[y] accept  [n] reject  [e] edit  [s] skip</Text>
    </Box>
  );
}
```

- [ ] Wire `awecode` (no args) → chat command
- [ ] Tests for component render using `ink-testing-library`
- [ ] Commit: `feat(cli): Direct Mode TUI with chat + approval views`

---

## Task 11: E2E test — typo fix scenario

**Files:**

- `packages/cli/tests/e2e-typo-fix.test.ts`

**Scenario:**

1. Create temp project with `src/foo.ts` containing typo "recieve"
2. Spawn `awecode` CLI
3. Type: `Fix typo 'recieve' → 'receive' in src/foo.ts`
4. Wait for approval prompt
5. Press `y` to accept
6. Assert file content has "receive"

- [ ] Use `ink-testing-library` to render CLI, simulate input
- [ ] Skip if no real LLM API key in env
- [ ] Commit: `test(cli): e2e typo fix scenario in Direct Mode`

---

## Task 12: Documentation

- Update `README.md` to mention Direct Mode usage
- Create `docs/direct-mode.md` with example session

- [ ] Commit: `docs: add Direct Mode documentation`

---

## Self-Review

### Spec coverage

- Spec 3 (Architecture): ✅ `packages/tools`, `packages/agent` created
- Spec 6 (Context Manager): ✅ Task 7
- Spec 8.2 (Approval Mode non-blocking): ✅ Task 9
- CONTEXT.md "Direct Mode" term: ✅ Task 10
- Q5 grill (queue + end of turn): ✅ Task 9
- Q33 grill (gpt-tokenizer): ✅ Task 7

### Placeholder scan

Code shown in tasks 2, 5, 7, 8, 9, 10. Tasks 3, 4, 6, 11, 12 reference code patterns (similar structure).

### Type consistency

- `ToolCall`, `ToolResult` defined Task 1, used Tasks 2-6
- `ContextEntry` defined Task 7, used Task 8
- `ApprovalRequest` defined Task 9, used Task 10
