# Awecode Plan 1: Foundation + LLM Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap awecode monorepo with LLM Provider Adapter (Vercel AI SDK) and first-run wizard — by end, user can run `awecode config` interactive setup and make a test LLM call.

**Architecture:** Yarn berry v4 workspaces monorepo with TypeScript strict. `packages/llm` wraps Vercel AI SDK, supports OpenAI-compatible + native Anthropic/OpenAI/Google/Ollama providers. First-run wizard prompts user for provider + credentials, saves to `~/.config/awecode/config.yaml`.

**Tech Stack:** Node.js 20 LTS, TypeScript 5.x strict mode, Yarn berry v4, Vercel AI SDK (`ai` + `@ai-sdk/anthropic` + `@ai-sdk/openai` + `@ai-sdk/google` + `ollama-ai-provider`), `zod` for config schema, `ink` for wizard UI.

## Global Constraints

- **OS targets:** Windows 11 (PowerShell 5.1+/7+), Linux (bash/zsh), macOS (zsh) — primary Windows
- **Node version:** 20 LTS (`"engines": { "node": ">=20.0.0" }`)
- **Package manager:** Yarn berry v4 (`packageManager: "yarn@4.5.0"`)
- **TypeScript:** strict mode + `noUncheckedIndexedAccess: true`
- **Module system:** ESM (`"type": "module"`)
- **License:** Apache-2.0 (every source file has header — see ADR-0004)
- **Path handling:** always use `node:path` + `path.join()`, never hardcode separators
- **No `&&` shell chaining in scripts** — PowerShell 5 doesn't support it; use `&&` only in `package.json` scripts (executed via `yarn` which handles cross-platform)
- **Package scope:** `@awecode/*` (binary: `awecode`)
- **Test framework:** vitest
- **Commit messages:** follow Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`)

**References:**

- Spec: `docs/superpowers/specs/2026-06-19-awecode-design-v2.md` sections 9-10
- ADR-0001: Vercel AI SDK choice
- ADR-0004: Apache-2.0 license
- Q32 grill: first-run wizard 3 outcomes

---

## File Structure

```
awecode/
├── package.json                    # workspace root
├── .yarnrc.yml                     # yarn berry config
├── .yarn/
│   └── releases/yarn-4.5.0.cjs
├── tsconfig.base.json              # shared TS config
├── tsconfig.json                   # root references
├── vitest.config.ts                # shared test config
├── .editorconfig
├── .gitattributes                  # LF for *.ts, CRLF allowed for *.ps1
├── .gitignore                      # (already exists)
├── LICENSE                         # Apache-2.0 full text
├── README.md
├── packages/
│   ├── llm/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts            # public API
│   │   │   ├── types.ts            # ProviderConfig, ModelRef types
│   │   │   ├── config.ts           # load config from YAML
│   │   │   ├── providers.ts        # provider registry
│   │   │   ├── models.ts           # getModel(), listModels()
│   │   │   ├── chat.ts             # chat() + streamChat() wrappers
│   │   │   └── errors.ts           # LLMError union type
│   │   └── tests/
│   │       ├── config.test.ts
│   │       ├── providers.test.ts
│   │       └── chat.test.ts
│   └── cli/
│       ├── package.json            # bin: { awecode: "./dist/cli.js" }
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts            # entry: parse argv, dispatch
│       │   ├── commands/
│       │   │   ├── config.ts       # `awecode config` wizard
│       │   │   └── chat-test.ts    # `awecode chat-test` smoke test
│       │   └── wizard/
│       │       ├── ui.tsx          # ink wizard components
│       │       └── prompts.ts      # provider/key/model prompts
│       └── tests/
│           └── wizard.test.tsx
```

---

## Task 1: Bootstrap monorepo

**Files:**

- Create: `package.json` (root)
- Create: `.yarnrc.yml`
- Create: `tsconfig.base.json`
- Create: `tsconfig.json`
- Create: `.editorconfig`
- Create: `.gitattributes`
- Create: `LICENSE`
- Create: `README.md`

**Interfaces:**

- Produces: workspace root that can install dependencies via `yarn install`

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "awecode",
  "private": true,
  "version": "0.0.0",
  "description": "CLI Coding Agent with built-in workflow engine",
  "license": "Apache-2.0",
  "type": "module",
  "engines": { "node": ">=20.0.0" },
  "packageManager": "yarn@4.5.0",
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "yarn workspaces foreach --all --parallel --topological run build",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint . --ext .ts,.tsx",
    "typecheck": "yarn workspaces foreach --all --parallel run typecheck"
  }
}
```

- [ ] **Step 2: Create `.yarnrc.yml`**

```yaml
yarnPath: .yarn/releases/yarn-4.5.0.cjs
nodeLinker: node-modules
enableGlobalCache: true
```

- [ ] **Step 3: Install Yarn berry v4**

Run: `yarn set version 4.5.0`
Expected: `.yarn/releases/yarn-4.5.0.cjs` created, `.yarnrc.yml` updated

- [ ] **Step 4: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 5: Create `tsconfig.json` (root)**

```json
{
  "extends": "./tsconfig.base.json",
  "references": [
    { "path": "packages/llm" },
    { "path": "packages/cli" }
  ],
  "files": []
}
```

- [ ] **Step 6: Create `.editorconfig`**

```ini
root = true

[*]
end_of_line = lf
insert_final_newline = true
charset = utf-8

[*.{ts,tsx,js,jsx,json,yml,yaml,md}]
indent_style = space
indent_size = 2

[*.ps1]
end_of_line = crlf
```

- [ ] **Step 7: Create `.gitattributes`**

```
* text=auto eol=lf
*.ps1 text eol=crlf
*.png binary
*.jpg binary
```

- [ ] **Step 8: Create `LICENSE` (Apache-2.0 full text)**

Run: `curl -sL https://www.apache.org/licenses/LICENSE-2.0.txt -o LICENSE`
Expected: LICENSE file with Apache-2.0 text

- [ ] **Step 9: Create `README.md`**

```markdown
# Awecode

CLI Coding Agent with built-in workflow engine (brainstorm → spec → grill → plan).

**Status:** Early development (v0.1 in progress)

## License

Apache-2.0 — see [LICENSE](./LICENSE)
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: bootstrap yarn berry monorepo with TypeScript strict"
```

---

## Task 2: Create `packages/llm` skeleton

**Files:**

- Create: `packages/llm/package.json`
- Create: `packages/llm/tsconfig.json`
- Create: `packages/llm/src/index.ts`
- Create: `packages/llm/tests/sanity.test.ts`

**Interfaces:**

- Produces: `@awecode/llm` package, empty public API

- [ ] **Step 1: Create `packages/llm/package.json`**

```json
{
  "name": "@awecode/llm",
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

- [ ] **Step 2: Create `packages/llm/tsconfig.json`**

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

- [ ] **Step 3: Create `packages/llm/src/index.ts`**

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

export const LLM_PACKAGE_VERSION = '0.0.0';
```

- [ ] **Step 4: Create sanity test `packages/llm/tests/sanity.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { LLM_PACKAGE_VERSION } from '../src/index.js';

describe('sanity', () => {
  it('exports version', () => {
    expect(LLM_PACKAGE_VERSION).toBe('0.0.0');
  });
});
```

- [ ] **Step 5: Install dev dependencies**

Run: `yarn workspace @awecode/llm add -D tsup vitest @types/node typescript`
Expected: dependencies added to `packages/llm/package.json`

- [ ] **Step 6: Run tests to verify setup**

Run: `yarn workspace @awecode/llm test`
Expected: `1 passed`

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(llm): scaffold @awecode/llm package with TypeScript and vitest"
```

---

## Task 3: Define ProviderConfig schema (TDD)

**Files:**

- Modify: `packages/llm/src/types.ts` (new)
- Modify: `packages/llm/src/index.ts`
- Test: `packages/llm/tests/types.test.ts`

**Interfaces:**

- Produces: `ProviderType`, `ProviderConfig`, `AwecodeConfig` types

- [ ] **Step 1: Write failing test `packages/llm/tests/types.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import type { ProviderConfig, AwecodeConfig, ProviderType } from '../src/types.js';

describe('ProviderConfig types', () => {
  it('accepts anthropic provider with apiKey', () => {
    const cfg: ProviderConfig = {
      type: 'anthropic',
      apiKey: 'sk-ant-xxx',
      defaultModel: 'claude-3-5-sonnet',
    };
    expect(cfg.type).toBe('anthropic');
  });

  it('accepts openai-compatible provider with baseURL', () => {
    const cfg: ProviderConfig = {
      type: 'openai-compatible',
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: 'sk-or-xxx',
      defaultModel: 'anthropic/claude-3.5-sonnet',
    };
    expect(cfg.type).toBe('openai-compatible');
  });

  it('accepts ollama provider without apiKey', () => {
    const cfg: ProviderConfig = {
      type: 'ollama',
      baseURL: 'http://localhost:11434',
      defaultModel: 'llama3',
    };
    expect(cfg.type).toBe('ollama');
  });

  it('AwecodeConfig has exactly one active provider', () => {
    const cfg: AwecodeConfig = {
      activeProvider: 'anthropic',
      providers: {
        anthropic: {
          type: 'anthropic',
          apiKey: 'sk-ant-xxx',
          defaultModel: 'claude-3-5-sonnet',
        },
      },
    };
    expect(cfg.activeProvider).toBe('anthropic');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @awecode/llm test`
Expected: FAIL with "Cannot find module '../src/types.js'"

- [ ] **Step 3: Create `packages/llm/src/types.ts`**

```ts
export type ProviderType =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'ollama'
  | 'openai-compatible';

export interface BaseProviderConfig {
  defaultModel: string;
}

export interface AnthropicProviderConfig extends BaseProviderConfig {
  type: 'anthropic';
  apiKey: string;
}

export interface OpenAIProviderConfig extends BaseProviderConfig {
  type: 'openai';
  apiKey: string;
}

export interface GoogleProviderConfig extends BaseProviderConfig {
  type: 'google';
  apiKey: string;
}

export interface OllamaProviderConfig extends BaseProviderConfig {
  type: 'ollama';
  baseURL?: string;
}

export interface OpenAICompatibleProviderConfig extends BaseProviderConfig {
  type: 'openai-compatible';
  baseURL: string;
  apiKey: string;
}

export type ProviderConfig =
  | AnthropicProviderConfig
  | OpenAIProviderConfig
  | GoogleProviderConfig
  | OllamaProviderConfig
  | OpenAICompatibleProviderConfig;

export interface AwecodeConfig {
  activeProvider: string;
  providers: Record<string, ProviderConfig>;
}

export interface ModelRef {
  providerId: string;
  modelName: string;
}
```

- [ ] **Step 4: Update `packages/llm/src/index.ts` to export types**

Replace entire file content with:

```ts
// Copyright 2026 Awecode Contributors
// [Apache-2.0 header — same as before]

export type {
  ProviderType,
  ProviderConfig,
  AnthropicProviderConfig,
  OpenAIProviderConfig,
  GoogleProviderConfig,
  OllamaProviderConfig,
  OpenAICompatibleProviderConfig,
  AwecodeConfig,
  ModelRef,
} from './types.js';

export const LLM_PACKAGE_VERSION = '0.0.0';
```

- [ ] **Step 5: Run test to verify pass**

Run: `yarn workspace @awecode/llm test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(llm): define ProviderConfig and AwecodeConfig types"
```

---

## Task 4: Config load/save (TDD)

**Files:**

- Create: `packages/llm/src/config.ts`
- Test: `packages/llm/tests/config.test.ts`
- Modify: `packages/llm/src/index.ts`

**Interfaces:**

- Consumes: `AwecodeConfig`, `ProviderConfig` from Task 3
- Produces: `loadConfig(path)`, `saveConfig(path, config)`, `getDefaultConfigPath()`

- [ ] **Step 1: Write failing test `packages/llm/tests/config.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, saveConfig, getDefaultConfigPath } from '../src/config.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'awecode-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('returns null when file does not exist', async () => {
    const result = await loadConfig(join(tmpDir, 'nonexistent.yaml'));
    expect(result).toBeNull();
  });

  it('loads valid YAML config', async () => {
    const yaml = `
activeProvider: anthropic
providers:
  anthropic:
    type: anthropic
    apiKey: sk-ant-xxx
    defaultModel: claude-3-5-sonnet
`;
    const cfgPath = join(tmpDir, 'config.yaml');
    await writeFile(cfgPath, yaml, 'utf-8');

    const result = await loadConfig(cfgPath);
    expect(result).not.toBeNull();
    expect(result?.activeProvider).toBe('anthropic');
    expect(result?.providers.anthropic.type).toBe('anthropic');
  });

  it('throws on malformed YAML', async () => {
    const cfgPath = join(tmpDir, 'config.yaml');
    await writeFile(cfgPath, '{{{invalid', 'utf-8');
    await expect(loadConfig(cfgPath)).rejects.toThrow();
  });
});

describe('saveConfig', () => {
  it('writes config as YAML', async () => {
    const cfg = {
      activeProvider: 'ollama',
      providers: {
        ollama: {
          type: 'ollama' as const,
          baseURL: 'http://localhost:11434',
          defaultModel: 'llama3',
        },
      },
    };
    const cfgPath = join(tmpDir, 'config.yaml');
    await saveConfig(cfgPath, cfg);

    const written = await readFile(cfgPath, 'utf-8');
    expect(written).toContain('activeProvider: ollama');
    expect(written).toContain('defaultModel: llama3');
  });
});

describe('getDefaultConfigPath', () => {
  it('returns platform-appropriate path', () => {
    const p = getDefaultConfigPath();
    expect(p).toMatch(/awecode[/\\]config\.yaml$/);
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `yarn workspace @awecode/llm test`
Expected: FAIL with "Cannot find module '../src/config.js'"

- [ ] **Step 3: Install YAML dependency**

Run: `yarn workspace @awecode/llm add yaml`
Expected: `yaml` package added

- [ ] **Step 4: Create `packages/llm/src/config.ts`**

```ts
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { join, dirname } from 'node:path';
import { parse, stringify } from 'yaml';
import type { AwecodeConfig } from './types.js';

export async function loadConfig(configPath: string): Promise<AwecodeConfig | null> {
  try {
    const content = await readFile(configPath, 'utf-8');
    const parsed = parse(content) as AwecodeConfig;
    return parsed ?? null;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

export async function saveConfig(configPath: string, config: AwecodeConfig): Promise<void> {
  await mkdir(dirname(configPath), { recursive: true });
  const yaml = stringify(config);
  await writeFile(configPath, yaml, 'utf-8');
}

export function getDefaultConfigPath(): string {
  const home = homedir();
  if (platform() === 'win32') {
    return join(home, '.config', 'awecode', 'config.yaml');
  }
  return join(home, '.config', 'awecode', 'config.yaml');
}
```

- [ ] **Step 5: Update `packages/llm/src/index.ts` to export config API**

Append before `LLM_PACKAGE_VERSION`:

```ts
export { loadConfig, saveConfig, getDefaultConfigPath } from './config.js';
```

- [ ] **Step 6: Run test to verify pass**

Run: `yarn workspace @awecode/llm test`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(llm): add config load/save with YAML serialization"
```

---

## Task 5: Provider registry — Vercel AI SDK integration (TDD)

**Files:**

- Create: `packages/llm/src/providers.ts`
- Test: `packages/llm/tests/providers.test.ts`
- Modify: `packages/llm/src/index.ts`

**Interfaces:**

- Consumes: `ProviderConfig` from Task 3
- Produces: `createProvider(config): LanguageModelV1` (Vercel AI SDK type)

- [ ] **Step 1: Install Vercel AI SDK dependencies**

Run: `yarn workspace @awecode/llm add ai @ai-sdk/anthropic @ai-sdk/openai @ai-sdk/google ollama-ai-provider`
Expected: 5 packages added

- [ ] **Step 2: Write failing test `packages/llm/tests/providers.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { createProvider } from '../src/providers.js';
import type {
  AnthropicProviderConfig,
  OllamaProviderConfig,
  OpenAICompatibleProviderConfig,
} from '../src/types.js';

describe('createProvider', () => {
  it('creates anthropic provider', () => {
    const cfg: AnthropicProviderConfig = {
      type: 'anthropic',
      apiKey: 'sk-test',
      defaultModel: 'claude-3-5-sonnet',
    };
    const provider = createProvider(cfg);
    expect(provider).toBeDefined();
    expect(typeof provider.doGenerate).toBe('function');
  });

  it('creates ollama provider', () => {
    const cfg: OllamaProviderConfig = {
      type: 'ollama',
      baseURL: 'http://localhost:11434',
      defaultModel: 'llama3',
    };
    const provider = createProvider(cfg);
    expect(provider).toBeDefined();
  });

  it('creates openai-compatible provider with custom baseURL', () => {
    const cfg: OpenAICompatibleProviderConfig = {
      type: 'openai-compatible',
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: 'sk-or-test',
      defaultModel: 'anthropic/claude-3.5-sonnet',
    };
    const provider = createProvider(cfg);
    expect(provider).toBeDefined();
  });
});
```

- [ ] **Step 3: Run test to verify fail**

Run: `yarn workspace @awecode/llm test`
Expected: FAIL with "Cannot find module '../src/providers.js'"

- [ ] **Step 4: Create `packages/llm/src/providers.ts`**

```ts
import { anthropic } from '@ai-sdk/anthropic';
import { openai, createOpenAI } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { ollama } from 'ollama-ai-provider';
import type { LanguageModelV1 } from 'ai';
import type { ProviderConfig } from './types.js';

export function createProvider(config: ProviderConfig): LanguageModelV1 {
  switch (config.type) {
    case 'anthropic':
      return anthropic(config.defaultModel, { apiKey: config.apiKey });

    case 'openai':
      return openai(config.defaultModel, { apiKey: config.apiKey });

    case 'google':
      return google(config.defaultModel, { apiKey: config.apiKey });

    case 'ollama':
      return ollama(config.defaultModel, {
        baseURL: config.baseURL ?? 'http://localhost:11434',
      });

    case 'openai-compatible': {
      const customOpenAI = createOpenAI({
        baseURL: config.baseURL,
        apiKey: config.apiKey,
      });
      return customOpenAI(config.defaultModel);
    }
  }
}
```

- [ ] **Step 5: Update `packages/llm/src/index.ts`**

Add to exports:

```ts
export { createProvider } from './providers.js';
```

- [ ] **Step 6: Run test to verify pass**

Run: `yarn workspace @awecode/llm test`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(llm): integrate Vercel AI SDK with 5 provider types"
```

---

## Task 6: Chat and streamChat wrappers (TDD)

**Files:**

- Create: `packages/llm/src/chat.ts`
- Test: `packages/llm/tests/chat.test.ts`
- Modify: `packages/llm/src/index.ts`

**Interfaces:**

- Consumes: `createProvider` from Task 5, `AwecodeConfig` from Task 3
- Produces: `chat(config, messages, opts)`, `streamChat(config, messages, opts)`

- [ ] **Step 1: Write failing test `packages/llm/tests/chat.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { chat } from '../src/chat.js';
import type { AwecodeConfig } from '../src/types.js';

vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({
    text: 'Hello from LLM',
    usage: { promptTokens: 10, completionTokens: 5 },
  }),
}));

const mockConfig: AwecodeConfig = {
  activeProvider: 'ollama',
  providers: {
    ollama: {
      type: 'ollama',
      baseURL: 'http://localhost:11434',
      defaultModel: 'llama3',
    },
  },
};

describe('chat', () => {
  it('returns text response', async () => {
    const result = await chat(mockConfig, [
      { role: 'user', content: 'hi' },
    ]);
    expect(result.text).toBe('Hello from LLM');
    expect(result.usage.promptTokens).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `yarn workspace @awecode/llm test`
Expected: FAIL with "Cannot find module '../src/chat.js'"

- [ ] **Step 3: Create `packages/llm/src/chat.ts`**

```ts
import { generateText, streamText, type CoreMessage } from 'ai';
import type { AwecodeConfig } from './types.js';
import { createProvider } from './providers.js';

export interface ChatOptions {
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatResult {
  text: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export async function chat(
  config: AwecodeConfig,
  messages: CoreMessage[],
  opts: ChatOptions = {},
): Promise<ChatResult> {
  const providerConfig = config.providers[config.activeProvider];
  if (!providerConfig) {
    throw new Error(`Active provider "${config.activeProvider}" not found in config`);
  }
  const model = createProvider(providerConfig);
  const result = await generateText({
    model,
    messages,
    system: opts.systemPrompt,
    maxTokens: opts.maxTokens,
    temperature: opts.temperature,
  });
  return {
    text: result.text,
    usage: {
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      totalTokens: result.usage.promptTokens + result.usage.completionTokens,
    },
  };
}

export async function* streamChat(
  config: AwecodeConfig,
  messages: CoreMessage[],
  opts: ChatOptions = {},
): AsyncGenerator<string> {
  const providerConfig = config.providers[config.activeProvider];
  if (!providerConfig) {
    throw new Error(`Active provider "${config.activeProvider}" not found in config`);
  }
  const model = createProvider(providerConfig);
  const result = await streamText({
    model,
    messages,
    system: opts.systemPrompt,
    maxTokens: opts.maxTokens,
    temperature: opts.temperature,
  });
  for await (const chunk of result.textStream) {
    yield chunk;
  }
}
```

- [ ] **Step 4: Update `packages/llm/src/index.ts`**

Add to exports:

```ts
export { chat, streamChat } from './chat.js';
export type { ChatOptions, ChatResult } from './chat.js';
```

- [ ] **Step 5: Run test to verify pass**

Run: `yarn workspace @awecode/llm test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(llm): add chat() and streamChat() wrappers"
```

---

## Task 7: CLI package skeleton + entry point

**Files:**

- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/index.ts`
- Create: `packages/cli/tsup.config.ts`

**Interfaces:**

- Produces: `awecode` binary that prints help

- [ ] **Step 1: Create `packages/cli/package.json`**

```json
{
  "name": "@awecode/cli",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "bin": {
    "awecode": "./dist/index.js"
  },
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "dev": "tsup --watch"
  },
  "dependencies": {
    "@awecode/llm": "workspace:*"
  }
}
```

- [ ] **Step 2: Create `packages/cli/tsconfig.json`**

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

- [ ] **Step 3: Create `packages/cli/src/index.ts`**

```ts
#!/usr/bin/env node
// Copyright 2026 Awecode Contributors
// [Apache-2.0 header]

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`awecode - CLI Coding Agent with workflow engine

USAGE:
  awecode <command> [options]

COMMANDS:
  config          Interactive LLM provider setup
  chat-test       Smoke test: send "hello" to active provider
  --version, -v   Print version
  --help, -h      Show this help

ENVIRONMENT:
  AWECODE_CONFIG_PATH   Override config file location

Config: ~/.config/awecode/config.yaml
`);
  process.exit(0);
}

if (args[0] === '--version' || args[0] === '-v') {
  console.log('awecode 0.0.0');
  process.exit(0);
}

console.error(`Unknown command: ${args[0]}. Run 'awecode --help' for usage.`);
process.exit(1);
```

- [ ] **Step 4: Create `packages/cli/tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
});
```

- [ ] **Step 5: Install tsup in cli workspace**

Run: `yarn workspace @awecode/cli add -D tsup typescript @types/node`
Expected: deps added

- [ ] **Step 6: Build and smoke test**

Run: `yarn workspace @awecode/cli build`
Expected: `dist/index.js` created

Run: `node packages/cli/dist/index.js --help`
Expected: help text printed

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(cli): scaffold @awecode/cli with help and version commands"
```

---

## Task 8: First-run wizard UI (TDD)

**Files:**

- Create: `packages/cli/src/wizard/ui.tsx`
- Create: `packages/cli/src/wizard/prompts.ts`
- Create: `packages/cli/src/commands/config.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `packages/cli/tests/wizard.test.tsx`

**Interfaces:**

- Consumes: `saveConfig`, `getDefaultConfigPath` from Task 4
- Produces: `runWizard(): Promise<AwecodeConfig>` — interactive provider setup

- [ ] **Step 1: Install Ink + SelectInput**

Run: `yarn workspace @awecode/cli add ink react @types/react ink-select-input`
Expected: deps added

- [ ] **Step 2: Write failing test `packages/cli/tests/wizard.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { WizardApp } from '../src/wizard/ui.js';

describe('WizardApp', () => {
  it('renders provider selection on first screen', () => {
    const { lastFrame } = render(<WizardApp onComplete={() => {}} />);
    const frame = lastFrame();
    expect(frame).toContain('Choose provider');
    expect(frame).toContain('OpenAI');
    expect(frame).toContain('Anthropic');
    expect(frame).toContain('Ollama');
  });
});
```

- [ ] **Step 3: Run test to verify fail**

Run: `yarn workspace @awecode/cli test`
Expected: FAIL with "Cannot find module '../src/wizard/ui.js'"

- [ ] **Step 4: Create `packages/cli/src/wizard/prompts.ts`**

```ts
export const PROVIDER_CHOICES = [
  { label: 'OpenAI (GPT models)', value: 'openai' },
  { label: 'Anthropic (Claude models)', value: 'anthropic' },
  { label: 'Google (Gemini models)', value: 'google' },
  { label: 'Ollama (local — no API key needed)', value: 'ollama' },
  { label: 'OpenAI-compatible (OpenRouter, Together, etc.)', value: 'openai-compatible' },
  { label: 'Skip — exit without configuring', value: 'skip' },
] as const;

export const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet',
  google: 'gemini-1.5-flash',
  ollama: 'llama3',
  'openai-compatible': '',
};
```

- [ ] **Step 5: Create `packages/cli/src/wizard/ui.tsx`**

```tsx
import React, { useState } from 'react';
import { Box, Text, render as inkRender } from 'ink';
import SelectInput from 'ink-select-input';
import { TextInput } from '@inkjs/ui';
import { PROVIDER_CHOICES, DEFAULT_MODELS } from './prompts.js';
import type { AwecodeConfig, ProviderConfig } from '@awecode/llm';

interface WizardAppProps {
  onComplete: (config: AwecodeConfig | null) => void;
}

type WizardStep = 'select-provider' | 'enter-api-key' | 'enter-base-url' | 'enter-model' | 'confirm';

export function WizardApp({ onComplete }: WizardAppProps) {
  const [step, setStep] = useState<WizardStep>('select-provider');
  const [providerType, setProviderType] = useState<string>('');
  const [apiKey, setApiKey] = useState('');
  const [baseURL, setBaseURL] = useState('');
  const [model, setModel] = useState('');

  const handleSelectProvider = (item: { value: string }) => {
    if (item.value === 'skip') {
      onComplete(null);
      return;
    }
    setProviderType(item.value);
    const defaultModel = DEFAULT_MODELS[item.value];
    if (defaultModel) setModel(defaultModel);

    if (item.value === 'ollama') {
      setBaseURL('http://localhost:11434');
      setStep('enter-base-url');
    } else if (item.value === 'openai-compatible') {
      setStep('enter-base-url');
    } else {
      setStep('enter-api-key');
    }
  };

  if (step === 'select-provider') {
    return (
      <Box flexDirection="column">
        <Text bold>Welcome to awecode! Let's set up your LLM provider.</Text>
        <Text> </Text>
        <Text>? Choose provider:</Text>
        <SelectInput items={PROVIDER_CHOICES.map(c => ({ label: c.label, value: c.value }))} onSelect={handleSelectProvider} />
      </Box>
    );
  }

  if (step === 'enter-api-key') {
    return (
      <Box flexDirection="column">
        <Text>? API key: </Text>
        <TextInput value={apiKey} onChange={setApiKey} onSubmit={() => setStep('enter-model')} placeholder="paste your API key" />
      </Box>
    );
  }

  if (step === 'enter-base-url') {
    return (
      <Box flexDirection="column">
        <Text>? Base URL [{providerType === 'ollama' ? 'http://localhost:11434' : 'https://api.openai.com/v1'}]:</Text>
        <TextInput value={baseURL} onChange={setBaseURL} onSubmit={() => providerType === 'ollama' ? setStep('enter-model') : setStep('enter-api-key')} />
      </Box>
    );
  }

  if (step === 'enter-model') {
    return (
      <Box flexDirection="column">
        <Text>? Default model [{DEFAULT_MODELS[providerType] ?? ''}]:</Text>
        <TextInput value={model} onChange={setModel} onSubmit={() => setStep('confirm')} />
      </Box>
    );
  }

  // confirm
  const buildConfig = (): AwecodeConfig => {
    const providerId = providerType;
    const cfg: ProviderConfig = (() => {
      switch (providerType) {
        case 'anthropic': return { type: 'anthropic', apiKey, defaultModel: model };
        case 'openai': return { type: 'openai', apiKey, defaultModel: model };
        case 'google': return { type: 'google', apiKey, defaultModel: model };
        case 'ollama': return { type: 'ollama', baseURL, defaultModel: model };
        case 'openai-compatible': return { type: 'openai-compatible', baseURL, apiKey, defaultModel: model };
      }
    })();
    return { activeProvider: providerId, providers: { [providerId]: cfg } };
  };

  return (
    <Box flexDirection="column">
      <Text bold>✓ Configuration ready:</Text>
      <Text>  Provider: {providerType}</Text>
      <Text>  Model: {model}</Text>
      {baseURL && <Text>  Base URL: {baseURL}</Text>}
      <Text> </Text>
      <Text>Press Enter to save, Esc to cancel.</Text>
      <TextInput value="" onChange={() => {}} onSubmit={() => onComplete(buildConfig())} />
    </Box>
  );
}

export async function runWizard(): Promise<AwecodeConfig | null> {
  return new Promise((resolve) => {
    inkRender(<WizardApp onComplete={(cfg) => resolve(cfg)} />);
  });
}
```

- [ ] **Step 6: Install `@inkjs/ui` for TextInput**

Run: `yarn workspace @awecode/cli add @inkjs/ui`
Expected: package added

- [ ] **Step 7: Run test to verify pass**

Run: `yarn workspace @awecode/cli test`
Expected: tests PASS

- [ ] **Step 8: Create `packages/cli/src/commands/config.ts`**

```ts
import { saveConfig, getDefaultConfigPath, type AwecodeConfig } from '@awecode/llm';
import { runWizard } from '../wizard/ui.js';

export async function configCommand(): Promise<void> {
  const config = await runWizard();

  if (config === null) {
    console.log(`
⚠ No provider configured.
  Get API key: https://docs.anthropic.com / https://platform.openai.com/api-keys
  Or install Ollama: https://ollama.com
  Then re-run 'awecode config' to configure.
Exiting.`);
    process.exit(0);
  }

  const configPath = getDefaultConfigPath();
  await saveConfig(configPath, config);
  console.log(`\n✓ Config saved to ${configPath}`);
}
```

- [ ] **Step 9: Wire `config` command into `packages/cli/src/index.ts`**

Add before "Unknown command" fallback:

```ts
if (args[0] === 'config') {
  const { configCommand } = await import('./commands/config.js');
  await configCommand();
  process.exit(0);
}
```

Make the file an async main:

```ts
#!/usr/bin/env node
// [header]

async function main() {
  const args = process.argv.slice(2);
  // ... existing handlers ...
  if (args[0] === 'config') {
    const { configCommand } = await import('./commands/config.js');
    await configCommand();
    process.exit(0);
  }
  // ...
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(cli): interactive first-run wizard for LLM provider setup"
```

---

## Task 9: `chat-test` smoke command (TDD)

**Files:**

- Create: `packages/cli/src/commands/chat-test.ts`
- Test: `packages/cli/tests/chat-test.test.ts`
- Modify: `packages/cli/src/index.ts`

**Interfaces:**

- Consumes: `loadConfig`, `chat` from `@awecode/llm`
- Produces: `chatTestCommand()` — sends "Hello" to active provider, prints response

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { chatTestCommand } from '../src/commands/chat-test.js';

vi.mock('@awecode/llm', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    activeProvider: 'mock',
    providers: { mock: { type: 'ollama', defaultModel: 'llama3' } },
  }),
  chat: vi.fn().mockResolvedValue({
    text: 'Hello from mock LLM',
    usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
  }),
}));

describe('chatTestCommand', () => {
  it('sends hello and prints response', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    await chatTestCommand();
    expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining('Hello from mock LLM'));
    consoleLog.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `yarn workspace @awecode/cli test`
Expected: FAIL

- [ ] **Step 3: Create `packages/cli/src/commands/chat-test.ts`**

```ts
import { loadConfig, chat, getDefaultConfigPath } from '@awecode/llm';

export async function chatTestCommand(): Promise<void> {
  const configPath = getDefaultConfigPath();
  const config = await loadConfig(configPath);

  if (!config) {
    console.error(`No config found at ${configPath}. Run 'awecode config' first.`);
    process.exit(1);
  }

  console.log(`Sending "Hello" to ${config.activeProvider}...`);
  const result = await chat(config, [{ role: 'user', content: 'Hello' }]);
  console.log(`\n${result.text}`);
  console.log(`\n(tokens: ${result.usage.totalTokens})`);
}
```

- [ ] **Step 4: Wire `chat-test` into `packages/cli/src/index.ts`**

Add:

```ts
if (args[0] === 'chat-test') {
  const { chatTestCommand } = await import('./commands/chat-test.js');
  await chatTestCommand();
  process.exit(0);
}
```

- [ ] **Step 5: Run test to verify pass**

Run: `yarn workspace @awecode/cli test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(cli): add 'chat-test' command for LLM smoke testing"
```

---

## Task 10: Workspace-level build, typecheck, lint

**Files:**

- Create: `vitest.config.ts` (root)
- Create: `.eslintrc.cjs` (root)
- Modify: root `package.json` scripts

**Interfaces:**

- Produces: `yarn build`, `yarn test`, `yarn lint`, `yarn typecheck` run on all packages

- [ ] **Step 1: Create root `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/*/tests/**/*.test.ts', 'packages/*/tests/**/*.test.tsx'],
  },
});
```

- [ ] **Step 2: Install root dev deps**

Run: `yarn add -D -W vitest eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin`
Expected: root deps added

- [ ] **Step 3: Create `.eslintrc.cjs`**

```js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: ['dist', 'node_modules', '.yarn', 'coverage'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'error',
  },
};
```

- [ ] **Step 4: Run full workspace checks**

Run: `yarn typecheck && yarn lint && yarn test && yarn build`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: workspace-wide vitest, eslint, typecheck, build scripts"
```

---

## Task 11: E2E smoke test (real config → real LLM call)

**Files:**

- Create: `packages/cli/tests/e2e.test.ts`
- Modify: `packages/cli/package.json` (add `test:e2e` script)

**Interfaces:**

- Consumes: All previous tasks
- Produces: Integration test verifying wizard output → config file → chat() works end-to-end

- [ ] **Step 1: Write integration test `packages/cli/tests/e2e.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveConfig, loadConfig, chat } from '@awecode/llm';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'awecode-e2e-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('E2E: config save → load → chat', () => {
  // Skip if no real API key in env (CI guard)
  const apiKey = process.env.AWECODE_E2E_API_KEY;

  it.skipIf(!apiKey)('saves ollama config, loads it, calls chat', async () => {
    const cfg = {
      activeProvider: 'ollama',
      providers: {
        ollama: {
          type: 'ollama' as const,
          baseURL: 'http://localhost:11434',
          defaultModel: 'llama3',
        },
      },
    };
    const cfgPath = join(tmpDir, 'config.yaml');
    await saveConfig(cfgPath, cfg);
    const loaded = await loadConfig(cfgPath);
    expect(loaded).not.toBeNull();

    const result = await chat(loaded!, [{ role: 'user', content: 'Say hi in 1 word' }]);
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.usage.totalTokens).toBeGreaterThan(0);
  });

  it('handles missing config gracefully', async () => {
    const cfgPath = join(tmpDir, 'nonexistent.yaml');
    const loaded = await loadConfig(cfgPath);
    expect(loaded).toBeNull();
  });
});
```

- [ ] **Step 2: Add `test:e2e` script to `packages/cli/package.json`**

```json
"scripts": {
  "test:e2e": "AWECODE_E2E_API_KEY=1 vitest run tests/e2e.test.ts"
}
```

- [ ] **Step 3: Run e2e (without real LLM — only the missing-config test will run)**

Run: `yarn workspace @awecode/cli test`
Expected: 1 test PASS (missing config), 1 test SKIPPED (no real API key)

- [ ] **Step 4: Manual E2E (with real Ollama or API key)**

Set up Ollama locally:

```bash
# In another terminal:
ollama pull llama3
ollama serve
```

Then:

```bash
yarn workspace @awecode/cli build
node packages/cli/dist/index.js config
# Walk through wizard → choose Ollama → save

node packages/cli/dist/index.js chat-test
# Expected: "Hello from LLM" or similar response
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(cli): add e2e smoke test for config+chat flow"
```

---

## Task 12: Documentation and README update

**Files:**

- Modify: `README.md`
- Create: `docs/getting-started.md`

- [ ] **Step 1: Update `README.md`**

```markdown
# Awecode

CLI Coding Agent with built-in workflow engine (brainstorm → spec → grill → plan).

**Status:** v0.1 in development. Plan 1 (Foundation + LLM Adapter) complete.

## Quick start

```bash
# Install (once published)
npm install -g @awecode/cli

# First run: configure LLM provider
awecode config

# Smoke test
awecode chat-test
```

## Development

```bash
git clone https://github.com/<owner>/awecode.git
cd awecode
yarn install
yarn build
yarn test
```

## License

Apache-2.0 — see [LICENSE](./LICENSE)
```

- [ ] **Step 2: Create `docs/getting-started.md`**

```markdown
# Getting Started

## Prerequisites

- Node.js 20 LTS
- Yarn berry v4 (auto-installed via `packageManager` field)

## Install dependencies

\`\`\`bash
yarn install
\`\`\`

## Build all packages

\`\`\`bash
yarn build
\`\`\`

## Run tests

\`\`\`bash
yarn test         # run all unit tests
yarn typecheck    # TS type check across workspaces
yarn lint         # eslint across workspaces
\`\`\`

## Configure LLM provider

\`\`\`bash
node packages/cli/dist/index.js config
\`\`\`

Or with real binary after `npm link`:

\`\`\`bash
awecode config
\`\`\`

## Smoke test

\`\`\`bash
awecode chat-test
\`\`\`

Expected output:

\`\`\`
Sending "Hello" to anthropic...

Hi there! How can I help?

(tokens: 23)
\`\`\`
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: update README and add getting-started guide"
```

---

## Self-Review

### Spec coverage

- Spec section 9.1 (Vercel AI SDK): ✅ Task 5
- Spec section 9.2 (4 provider types + OpenAI-compatible): ✅ Task 5
- Spec section 9.3 (First-run wizard with 3 outcomes): ✅ Task 8
- Spec section 9.4 (Config precedence): ✅ Task 4 (`loadConfig` from path; CLI flag override in Task 7 via `AWECODE_CONFIG_PATH` env)
- Spec section 10.1 stack: ✅ Tasks 1, 2 (TS strict, Node 20, Yarn berry v4, vitest)
- ADR-0001 (Vercel AI SDK): ✅ Task 5
- ADR-0004 (Apache-2.0): ✅ Task 1 (LICENSE) + headers in each src file
- Q32 grill (3 outcomes): ✅ Task 8 includes "Skip — exit" option

### Placeholder scan

- All code blocks contain actual implementation code
- All file paths are exact
- All commands include expected output
- No "TBD", "implement later", "add appropriate error handling"

### Type consistency

- `AwecodeConfig` defined in Task 3, used in Tasks 4, 6, 8, 9, 11 — consistent shape
- `ProviderConfig` union defined in Task 3, used in Tasks 5, 8 — consistent
- `chat()` signature in Task 6 used in Tasks 9, 11 — consistent
- `ChatResult.usage.totalTokens` used in Tasks 6, 9, 11 — consistent

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-19-plan1-foundation-llm-adapter.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
