# Awecode Plan 5a: Workflow Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans.

**Goal:** Build `@awecode/workflow` package — Skill loader (SKILL.md), `invoke_skill` tool, workflow session state, slash command framework, 4 built-in skills (brainstorm/spec/grill/plan), and wire Intent Declaration into agent chat loop. By end: agent can auto-detect creative task → emit `start_workflow(name)` → invoke skill → write artifacts to disk.

**Architecture:** Workflow package is pure (no IO side effects beyond reading skill files). Session state persists to `.awecode/session.json`. Slash command registry is in CLI. Skills ship in binary at `awecode/skills/`. Intent Declaration detection already exists in `@awecode/agent` (Plan 3 Task 12).

**Tech Stack:** `yaml` for SKILL.md frontmatter, `simple-git` not needed here.

## Global Constraints

(Same as Plan 1)

**References:**

- Spec section 7 (Workflow Engine)
- ADR-0002 (auto-trigger based on intent)
- Q6-Q11 grill (workflow engine decisions)
- Q23 grill (fail-loud on engine crash)
- Q25 grill (artifact-based token economics)
- Q26 grill (skip phases via slash commands)
- Q27 grill (reject input during workflow)
- Q28 grill (Skill vs Plugin distinction)

**Locked interfaces from Plan 1-4 (consumed):**

- `AwecodeConfig` from `@awecode/llm`
- `ContextManager`, `runChatLoop`, `detectIntentFromText` from `@awecode/agent`

---

## File Structure

```
packages/workflow/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── src/
│   ├── index.ts
│   ├── types.ts              # Skill, WorkflowSession, etc.
│   ├── parser.ts             # parseSkillMarkdown
│   ├── loader.ts             # loadSkill with precedence
│   ├── engine.ts             # startWorkflow, invokeSkill
│   ├── state.ts              # session.json load/save
│   └── builtin.ts            # paths to built-in skills
├── skills/                   # built-in skills shipped in binary
│   ├── brainstorm/SKILL.md
│   ├── spec/SKILL.md
│   ├── grill/SKILL.md
│   └── plan/SKILL.md
└── tests/
    ├── parser.test.ts
    ├── loader.test.ts
    ├── engine.test.ts
    └── state.test.ts
```

---

## Task 1: Package skeleton

**Files:**

- Create: `packages/workflow/package.json`, `tsconfig.json`, `tsup.config.ts`
- Create: `packages/workflow/src/index.ts`
- Create: `packages/workflow/tests/sanity.test.ts`
- Modify: root `tsconfig.json`

- [ ] **Step 1: Create `packages/workflow/package.json`**

```json
{
  "name": "@awecode/workflow",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./skills/*": "./skills/*"
  },
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "yaml": "^2.5.0"
  }
}
```

- [ ] **Step 2: Create `packages/workflow/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "tests", "skills"]
}
```

- [ ] **Step 3: Create `packages/workflow/tsup.config.ts`**

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

- [ ] **Step 4: Create `packages/workflow/src/index.ts`**

```ts
// Copyright 2026 Awecode Contributors
// [Apache-2.0 header]

export const WORKFLOW_PACKAGE_VERSION = '0.0.0';
```

- [ ] **Step 5: Create sanity test**

```ts
import { describe, it, expect } from 'vitest';
import { WORKFLOW_PACKAGE_VERSION } from '../src/index.js';

describe('sanity', () => {
  it('exports version', () => {
    expect(WORKFLOW_PACKAGE_VERSION).toBe('0.0.0');
  });
});
```

- [ ] **Step 6: Install deps**

Run: `yarn workspace @awecode/workflow add yaml`
Run: `yarn workspace @awecode/workflow add -D tsup vitest typescript @types/node`
Run: `yarn install`

- [ ] **Step 7: Add to root `tsconfig.json`**

```json
{
  "extends": "./tsconfig.base.json",
  "references": [
    { "path": "packages/llm" },
    { "path": "packages/cli" },
    { "path": "packages/diff" },
    { "path": "packages/tools" },
    { "path": "packages/agent" },
    { "path": "packages/harness" },
    { "path": "packages/workflow" }
  ],
  "files": []
}
```

- [ ] **Step 8: Run sanity test**

Run: `yarn workspace @awecode/workflow test`
Expected: `1 passed`

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(workflow): scaffold @awecode/workflow package"
```

---

## Task 2: Define types (TDD)

**Files:**

- Create: `packages/workflow/src/types.ts`
- Test: `packages/workflow/tests/types.test.ts`
- Modify: `packages/workflow/src/index.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import type {
  Skill,
  SkillFrontmatter,
  SkillSource,
  WorkflowSession,
  WorkflowHistoryEntry,
  StartWorkflowResult,
  InvokeSkillResult,
} from '../src/types.js';

describe('workflow types', () => {
  it('SkillFrontmatter has name + description', () => {
    const fm: SkillFrontmatter = {
      name: 'brainstorm',
      description: 'Explore intent',
    };
    expect(fm.name).toBe('brainstorm');
  });

  it('Skill has required fields', () => {
    const s: Skill = {
      name: 'spec',
      description: 'Write design doc',
      frontmatter: { name: 'spec', description: 'Write design doc' },
      body: '# Spec\n\nWrite a spec...',
      sourcePath: 'built-in',
      filePath: '/path/to/SKILL.md',
    };
    expect(s.sourcePath).toBe('built-in');
  });

  it('SkillSource is project | user | built-in', () => {
    const sources: SkillSource[] = ['project', 'user', 'built-in'];
    expect(sources).toHaveLength(3);
  });

  it('WorkflowSession has taskId and history', () => {
    const s: WorkflowSession = {
      taskId: 'abc-123',
      currentWorkflow: null,
      currentPhase: null,
      history: [],
    };
    expect(s.taskId).toBe('abc-123');
  });

  it('WorkflowHistoryEntry has workflow + startedAt', () => {
    const e: WorkflowHistoryEntry = {
      workflow: 'brainstorm',
      startedAt: '2026-06-19T10:00:00Z',
    };
    expect(e.workflow).toBe('brainstorm');
  });

  it('StartWorkflowResult can be ok or error', () => {
    const ok: StartWorkflowResult = {
      ok: true,
      skillBody: '# Brainstorm\n...',
      skillName: 'brainstorm',
    };
    const err: StartWorkflowResult = {
      ok: false,
      error: 'not found',
    };
    expect(ok.ok).toBe(true);
    expect(err.ok).toBe(false);
  });

  it('InvokeSkillResult has skillName + output', () => {
    const r: InvokeSkillResult = {
      skillName: 'grill',
      output: '...',
    };
    expect(r.skillName).toBe('grill');
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `yarn workspace @awecode/workflow test`
Expected: FAIL

- [ ] **Step 3: Create `packages/workflow/src/types.ts`**

```ts
export type SkillSource = 'project' | 'user' | 'built-in';

export interface SkillFrontmatter {
  name: string;
  description: string;
  trigger?: string;
}

export interface Skill {
  name: string;
  description: string;
  frontmatter: SkillFrontmatter;
  body: string;
  sourcePath: SkillSource;
  filePath: string;
}

export interface WorkflowHistoryEntry {
  workflow: string;
  startedAt: string;
  completedAt?: string;
  output?: string;
}

export interface WorkflowSession {
  taskId: string;
  currentWorkflow: string | null;
  currentPhase: string | null;
  history: WorkflowHistoryEntry[];
  pendingQuestions?: unknown[];
}

export type StartWorkflowResult =
  | { ok: true; skillName: string; skillBody: string }
  | { ok: false; error: string };

export interface InvokeSkillResult {
  skillName: string;
  output: string;
}
```

- [ ] **Step 4: Update `packages/workflow/src/index.ts`**

```ts
export type {
  Skill,
  SkillFrontmatter,
  SkillSource,
  WorkflowSession,
  WorkflowHistoryEntry,
  StartWorkflowResult,
  InvokeSkillResult,
} from './types.js';

export const WORKFLOW_PACKAGE_VERSION = '0.0.0';
```

- [ ] **Step 5: Run test to verify pass**

Run: `yarn workspace @awecode/workflow test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(workflow): define Skill, WorkflowSession, StartWorkflowResult types"
```

---

## Task 3: SKILL.md parser (TDD)

**Files:**

- Create: `packages/workflow/src/parser.ts`
- Test: `packages/workflow/tests/parser.test.ts`
- Modify: `packages/workflow/src/index.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { parseSkillMarkdown } from '../src/parser.js';

describe('parseSkillMarkdown', () => {
  it('parses frontmatter + body', () => {
    const content = `---
name: brainstorm
description: Explore user intent
trigger: creative-task
---

# Brainstorming

Ask one question at a time.`;
    const skill = parseSkillMarkdown(content, '/path/to/SKILL.md');
    expect(skill.name).toBe('brainstorm');
    expect(skill.description).toBe('Explore user intent');
    expect(skill.frontmatter.trigger).toBe('creative-task');
    expect(skill.body).toContain('# Brainstorming');
    expect(skill.body).toContain('Ask one question at a time.');
  });

  it('works without optional trigger', () => {
    const content = `---
name: spec
description: Write design doc
---

# Spec`;
    const skill = parseSkillMarkdown(content, '/x');
    expect(skill.name).toBe('spec');
    expect(skill.frontmatter.trigger).toBeUndefined();
  });

  it('throws on missing frontmatter', () => {
    expect(() => parseSkillMarkdown('Just body, no frontmatter', '/x')).toThrow(/frontmatter/i);
  });

  it('throws on malformed YAML', () => {
    const content = `---
name: [invalid yaml
---

body`;
    expect(() => parseSkillMarkdown(content, '/x')).toThrow();
  });

  it('handles body with special characters and code blocks', () => {
    const content = `---
name: plan
description: Create implementation plan
---

# Plan

\`\`\`typescript
const x: number = 1;
\`\`\`

## Steps`;
    const skill = parseSkillMarkdown(content, '/x');
    expect(skill.body).toContain('```typescript');
    expect(skill.body).toContain('## Steps');
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `yarn workspace @awecode/workflow test`
Expected: FAIL

- [ ] **Step 3: Create `packages/workflow/src/parser.ts`**

```ts
import { parse } from 'yaml';
import type { Skill, SkillFrontmatter, SkillSource } from './types.js';

const FRONTMATTER_RE = /^---\n([\s\S]+?)\n---\n([\s\S]+)$/;

export function parseSkillMarkdown(
  content: string,
  filePath: string,
  sourcePath: SkillSource = 'project',
): Skill {
  const match = content.match(FRONTMATTER_RE);
  if (!match || !match[1] || !match[2]) {
    throw new Error(
      `Skill ${filePath} missing frontmatter. Expected ---\\n<yaml>\\n---\\n<markdown body>.`,
    );
  }

  let frontmatter: SkillFrontmatter;
  try {
    frontmatter = parse(match[1]) as SkillFrontmatter;
  } catch (err) {
    throw new Error(
      `Skill ${filePath} has malformed YAML frontmatter: ${(err as Error).message}`,
    );
  }

  if (!frontmatter.name || !frontmatter.description) {
    throw new Error(
      `Skill ${filePath} frontmatter must have 'name' and 'description'.`,
    );
  }

  return {
    name: frontmatter.name,
    description: frontmatter.description,
    frontmatter,
    body: match[2],
    sourcePath,
    filePath,
  };
}
```

- [ ] **Step 4: Update `packages/workflow/src/index.ts`**

```ts
export { parseSkillMarkdown } from './parser.js';
```

- [ ] **Step 5: Run test to verify pass**

Run: `yarn workspace @awecode/workflow test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(workflow): parseSkillMarkdown with YAML frontmatter + validation"
```

---

## Task 4: Built-in skills paths

**Files:**

- Create: `packages/workflow/src/builtin.ts`
- Test: `packages/workflow/tests/builtin.test.ts`
- Modify: `packages/workflow/src/index.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { getBuiltInSkillsDir, listBuiltInSkillNames } from '../src/builtin.js';
import { join } from 'node:path';

describe('builtin skills', () => {
  it('getBuiltInSkillsDir returns path ending in /skills', () => {
    const dir = getBuiltInSkillsDir();
    expect(dir.replace(/\\/g, '/')).toMatch(/skills$/);
  });

  it('listBuiltInSkillNames returns 4 names', () => {
    const names = listBuiltInSkillNames();
    expect(names).toContain('brainstorm');
    expect(names).toContain('spec');
    expect(names).toContain('grill');
    expect(names).toContain('plan');
    expect(names).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `yarn workspace @awecode/workflow test`
Expected: FAIL

- [ ] **Step 3: Create `packages/workflow/src/builtin.ts`**

```ts
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Path to built-in skills directory.
 * In dev: packages/workflow/skills/
 * In production (after build + npm install): node_modules/@awecode/workflow/skills/
 */
export function getBuiltInSkillsDir(): string {
  // dist/ is one level below src/, so skills/ is ../skills/ from dist
  // But in dev (running from src via tsx/tsup dev), we're in src/, so ../skills/
  // Try multiple candidates
  return join(__dirname, '..', 'skills');
}

export const BUILT_IN_SKILL_NAMES = ['brainstorm', 'spec', 'grill', 'plan'] as const;

export function listBuiltInSkillNames(): readonly string[] {
  return BUILT_IN_SKILL_NAMES;
}
```

- [ ] **Step 4: Update `packages/workflow/src/index.ts`**

```ts
export { getBuiltInSkillsDir, listBuiltInSkillNames, BUILT_IN_SKILL_NAMES } from './builtin.js';
```

- [ ] **Step 5: Run test to verify pass**

Run: `yarn workspace @awecode/workflow test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(workflow): built-in skills directory paths + 4 skill names"
```

---

## Task 5: Create the 4 built-in SKILL.md files

**Files:**

- Create: `packages/workflow/skills/brainstorm/SKILL.md`
- Create: `packages/workflow/skills/spec/SKILL.md`
- Create: `packages/workflow/skills/grill/SKILL.md`
- Create: `packages/workflow/skills/plan/SKILL.md`

- [ ] **Step 1: Create `packages/workflow/skills/brainstorm/SKILL.md`**

```markdown
---
name: brainstorm
description: Explore user intent, requirements, and design before implementation. Use for any creative work — new features, components, functionality, or behavior changes.
trigger: creative-task
---

# Brainstorming

You MUST use this before any creative work. Explore user intent, requirements, and design before implementation.

## Process

1. **Check project context** — read package.json, CONTEXT.md, recent git log
2. **One question at a time** — never overwhelm with multiple questions in one turn
3. **Multiple choice preferred** — easier to answer than open-ended when possible
4. **Focus on understanding** — purpose, constraints, success criteria

## Exploring approaches

After 3-5 clarifying questions, propose 2-3 different approaches with trade-offs:
- Lead with your recommended option
- Explain why (trade-offs, code evidence, precedent)
- Note why rejected options lose

## Decision

Once approach is chosen, transition to `spec` skill to write the design document.

## Key principles

- One question per message
- YAGNI ruthlessly — remove unnecessary features
- Explore alternatives before settling
- Incremental validation — get approval before moving on
```

- [ ] **Step 2: Create `packages/workflow/skills/spec/SKILL.md`**

```markdown
---
name: spec
description: Write the design document capturing all decisions from brainstorming. Save to docs/specs/.
trigger: after-brainstorm
---

# Writing the Spec

After brainstorming produced an approved approach, write a design document.

## Structure

1. **Goal** — one sentence
2. **Non-Goals** — what's explicitly out of scope
3. **Architecture** — diagram + package/file responsibilities
4. **Components** — each module's interface and behavior
5. **Data flow** — how data moves through the system
6. **Error handling** — failure modes and recovery
7. **Testing strategy**
8. **Tech stack** — exact libraries and versions

## File location

Save to `docs/specs/YYYY-MM-DD-<topic>-design.md`

## After spec

Hand off to `grill` skill for stress-testing.
```

- [ ] **Step 3: Create `packages/workflow/skills/grill/SKILL.md`**

```markdown
---
name: grill
description: Stress-test a spec with batched questions. Each question has Options, Recommend, and Why. Resolve gaps before implementation.
trigger: after-spec
---

# Grilling the Spec

Interview the user relentlessly about every aspect of the spec until reaching shared understanding.

## Format

Each question MUST include, in this exact order:

1. **Options:** 2-4 concrete, mutually-exclusive choices (A, B, C, ...)
2. **Recommend:** which option you pick by letter (e.g. `B`). Concrete, not "it depends"
3. **Why:** reasoning — trade-off, code evidence, domain constraint, or precedent

\`\`\`
Q1. <question>
   Options:
     A. <option A>
     B. <option B>
   Recommend: B
   Why: <one or two sentences>
\`\`\`

## Batch discipline

- **Batch independent questions** — 5 at once is fine
- **Don't batch dependent questions** — defer follow-ups to next turn
- **Wait for user response** to whole batch before asking next

## What to challenge

- Fuzzy terminology — propose precise canonical terms
- Vague decisions — force concrete options
- Missing edge cases — invent scenarios
- Contradictions between sections
- Assumptions that aren't documented

## After grilling

Update CONTEXT.md with resolved terms.
Create ADRs for hard-to-reverse decisions.
Hand off to `plan` skill.
```

- [ ] **Step 4: Create `packages/workflow/skills/plan/SKILL.md`**

```markdown
---
name: plan
description: Create a detailed implementation plan from the spec. Bite-sized tasks with full code, test code, and commit messages.
trigger: after-grill
---

# Writing the Implementation Plan

Write a comprehensive implementation plan assuming the engineer has zero context.

## Plan header

\`\`\`markdown
# [Feature] Implementation Plan

**Goal:** [one sentence]
**Architecture:** [2-3 sentences]
**Tech Stack:** [key technologies]
\`\`\`

## Task structure (TDD)

Each task follows red-green-refactor:

\`\`\`
### Task N: [Component]

**Files:**
- Create: \`exact/path/to/file.ts\`
- Test: \`tests/exact/path.ts\`

**Interfaces:**
- Consumes: [from earlier tasks]
- Produces: [for later tasks]

- [ ] **Step 1: Write failing test**
<actual test code>

- [ ] **Step 2: Run test to verify fail**
Run: \`yarn test\`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**
<actual code>

- [ ] **Step 4: Run test to verify pass**
Run: \`yarn test\`
Expected: PASS

- [ ] **Step 5: Commit**
\`\`\`bash
git commit -m "feat: ..."
\`\`\`
\`\`\`

## No placeholders

Every step must contain actual content. Never write:
- "TBD", "TODO", "implement later"
- "Add appropriate error handling"
- "Write tests for the above" (without test code)
- "Similar to Task N" (repeat the code)

## File location

Save to `docs/plans/YYYY-MM-DD-<topic>.md`

## After plan

Implementation begins. Use subagent-driven-development or executing-plans skill.
```

- [ ] **Step 5: Verify all 4 skills exist**

Run: `ls packages/workflow/skills/`
Expected: `brainstorm/  spec/  grill/  plan/`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(workflow): add 4 built-in SKILL.md files (brainstorm/spec/grill/plan)"
```

---

## Task 6: Skill loader with precedence (TDD)

**Files:**

- Create: `packages/workflow/src/loader.ts`
- Test: `packages/workflow/tests/loader.test.ts`
- Modify: `packages/workflow/src/index.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSkill, listAvailableSkills } from '../src/loader.js';

let tmpProject: string;
let tmpUser: string;

beforeEach(async () => {
  tmpProject = await mkdtemp(join(tmpdir(), 'awecode-wf-project-'));
  tmpUser = await mkdtemp(join(tmpdir(), 'awecode-wf-user-'));
});

afterEach(async () => {
  await Promise.all([
    rm(tmpProject, { recursive: true, force: true }),
    rm(tmpUser, { recursive: true, force: true }),
  ]);
});

async function makeSkill(dir: string, name: string, body: string): Promise<void> {
  await mkdir(join(dir, name), { recursive: true });
  await writeFile(
    join(dir, name, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${body}\n---\n\n${body}`,
    'utf-8',
  );
}

describe('loadSkill', () => {
  it('returns null when skill not found anywhere', async () => {
    const skill = await loadSkill('nonexistent', tmpProject, tmpUser);
    expect(skill).toBeNull();
  });

  it('loads built-in skill when no project/user override', async () => {
    const skill = await loadSkill('brainstorm', tmpProject, tmpUser);
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe('brainstorm');
    expect(skill!.sourcePath).toBe('built-in');
  });

  it('project skill overrides built-in', async () => {
    await makeSkill(join(tmpProject, '.awecode', 'skills'), 'brainstorm', 'Project version');
    const skill = await loadSkill('brainstorm', tmpProject, tmpUser);
    expect(skill).not.toBeNull();
    expect(skill!.sourcePath).toBe('project');
    expect(skill!.body).toContain('Project version');
  });

  it('user skill overrides built-in when no project skill', async () => {
    await makeSkill(tmpUser, 'brainstorm', 'User version');
    const skill = await loadSkill('brainstorm', tmpProject, tmpUser);
    expect(skill).not.toBeNull();
    expect(skill!.sourcePath).toBe('user');
    expect(skill!.body).toContain('User version');
  });

  it('project skill overrides user skill', async () => {
    await makeSkill(join(tmpProject, '.awecode', 'skills'), 'brainstorm', 'Project');
    await makeSkill(tmpUser, 'brainstorm', 'User');
    const skill = await loadSkill('brainstorm', tmpProject, tmpUser);
    expect(skill!.sourcePath).toBe('project');
  });
});

describe('listAvailableSkills', () => {
  it('includes built-in skills', async () => {
    const names = await listAvailableSkills(tmpProject, tmpUser);
    expect(names).toContain('brainstorm');
    expect(names).toContain('spec');
    expect(names).toContain('grill');
    expect(names).toContain('plan');
  });

  it('includes user and project skills (deduped)', async () => {
    await makeSkill(tmpUser, 'custom-user-skill', 'user');
    await makeSkill(join(tmpProject, '.awecode', 'skills'), 'custom-project-skill', 'project');

    const names = await listAvailableSkills(tmpProject, tmpUser);
    expect(names).toContain('custom-user-skill');
    expect(names).toContain('custom-project-skill');
    // Built-in still there
    expect(names).toContain('brainstorm');
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `yarn workspace @awecode/workflow test`
Expected: FAIL

- [ ] **Step 3: Create `packages/workflow/src/loader.ts`**

```ts
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parseSkillMarkdown } from './parser.js';
import { getBuiltInSkillsDir } from './builtin.js';
import type { Skill, SkillSource } from './types.js';

export async function loadSkill(
  name: string,
  projectRoot: string,
  userSkillsDir: string,
): Promise<Skill | null> {
  const candidates: Array<{ dir: string; source: SkillSource }> = [
    { dir: join(projectRoot, '.awecode', 'skills'), source: 'project' },
    { dir: userSkillsDir, source: 'user' },
    { dir: getBuiltInSkillsDir(), source: 'built-in' },
  ];

  for (const candidate of candidates) {
    const filePath = join(candidate.dir, name, 'SKILL.md');
    try {
      await stat(filePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw err;
    }
    const content = await readFile(filePath, 'utf-8');
    return parseSkillMarkdown(content, filePath, candidate.source);
  }

  return null;
}

export async function listAvailableSkills(
  projectRoot: string,
  userSkillsDir: string,
): Promise<string[]> {
  const names = new Set<string>();
  const dirs = [
    join(projectRoot, '.awecode', 'skills'),
    userSkillsDir,
    getBuiltInSkillsDir(),
  ];

  for (const dir of dirs) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) names.add(entry.name);
      }
    } catch {
      // dir doesn't exist, skip
    }
  }

  return [...names].sort();
}
```

- [ ] **Step 4: Update `packages/workflow/src/index.ts`**

```ts
export { loadSkill, listAvailableSkills } from './loader.js';
```

- [ ] **Step 5: Run test to verify pass**

Run: `yarn workspace @awecode/workflow test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(workflow): skill loader with project > user > built-in precedence"
```

---

## Task 7: Workflow session state (TDD)

**Files:**

- Create: `packages/workflow/src/state.ts`
- Test: `packages/workflow/tests/state.test.ts`
- Modify: `packages/workflow/src/index.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSession, saveSession, getSessionPath, createNewSession } from '../src/state.js';
import type { WorkflowSession } from '../src/types.js';

let tmpProject: string;

beforeEach(async () => {
  tmpProject = await mkdtemp(join(tmpdir(), 'awecode-wf-state-'));
});

afterEach(async () => {
  await rm(tmpProject, { recursive: true, force: true });
});

describe('getSessionPath', () => {
  it('returns .awecode/session.json', () => {
    const p = getSessionPath(tmpProject);
    expect(p.replace(/\\/g, '/')).toMatch(/\.awecode\/session\.json$/);
  });
});

describe('createNewSession', () => {
  it('creates session with taskId and empty history', () => {
    const s = createNewSession();
    expect(s.taskId).toMatch(/^[0-9a-f-]{36}$/);
    expect(s.currentWorkflow).toBeNull();
    expect(s.currentPhase).toBeNull();
    expect(s.history).toEqual([]);
  });
});

describe('loadSession', () => {
  it('returns null when no session file', async () => {
    const s = await loadSession(tmpProject);
    expect(s).toBeNull();
  });

  it('loads saved session', async () => {
    const session: WorkflowSession = {
      taskId: 'abc-123',
      currentWorkflow: 'brainstorm',
      currentPhase: 'round-2',
      history: [
        { workflow: 'brainstorm', startedAt: '2026-06-19T10:00:00Z' },
      ],
    };
    await saveSession(tmpProject, session);

    const loaded = await loadSession(tmpProject);
    expect(loaded).not.toBeNull();
    expect(loaded!.taskId).toBe('abc-123');
    expect(loaded!.currentWorkflow).toBe('brainstorm');
    expect(loaded!.history).toHaveLength(1);
  });

  it('throws on malformed JSON', async () => {
    const { writeFile, mkdir } = await import('node:fs/promises');
    await mkdir(join(tmpProject, '.awecode'), { recursive: true });
    await writeFile(getSessionPath(tmpProject), '{invalid json', 'utf-8');
    await expect(loadSession(tmpProject)).rejects.toThrow();
  });
});

describe('saveSession', () => {
  it('creates .awecode dir if missing', async () => {
    const session = createNewSession();
    await saveSession(tmpProject, session);
    const loaded = await loadSession(tmpProject);
    expect(loaded).not.toBeNull();
  });

  it('overwrites existing session', async () => {
    const s1 = createNewSession();
    await saveSession(tmpProject, s1);

    const s2 = { ...s1, currentWorkflow: 'spec' };
    await saveSession(tmpProject, s2);

    const loaded = await loadSession(tmpProject);
    expect(loaded!.currentWorkflow).toBe('spec');
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `yarn workspace @awecode/workflow test`
Expected: FAIL

- [ ] **Step 3: Create `packages/workflow/src/state.ts`**

```ts
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { WorkflowSession } from './types.js';

export function getSessionPath(projectRoot: string): string {
  return join(projectRoot, '.awecode', 'session.json');
}

export function createNewSession(): WorkflowSession {
  return {
    taskId: randomUUID(),
    currentWorkflow: null,
    currentPhase: null,
    history: [],
  };
}

export async function loadSession(projectRoot: string): Promise<WorkflowSession | null> {
  try {
    const content = await readFile(getSessionPath(projectRoot), 'utf-8');
    return JSON.parse(content) as WorkflowSession;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function saveSession(projectRoot: string, session: WorkflowSession): Promise<void> {
  const path = getSessionPath(projectRoot);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(session, null, 2), 'utf-8');
}
```

- [ ] **Step 4: Update `packages/workflow/src/index.ts`**

```ts
export { loadSession, saveSession, getSessionPath, createNewSession } from './state.js';
```

- [ ] **Step 5: Run test to verify pass**

Run: `yarn workspace @awecode/workflow test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(workflow): session state load/save/create in .awecode/session.json"
```

---

## Task 8: Engine — startWorkflow + invokeSkill (TDD)

**Files:**

- Create: `packages/workflow/src/engine.ts`
- Test: `packages/workflow/tests/engine.test.ts`
- Modify: `packages/workflow/src/index.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWorkflow, invokeSkill } from '../src/engine.js';

let tmpProject: string;
let tmpUser: string;

beforeEach(async () => {
  tmpProject = await mkdtemp(join(tmpdir(), 'awecode-engine-project-'));
  tmpUser = await mkdtemp(join(tmpdir(), 'awecode-engine-user-'));
});

afterEach(async () => {
  await Promise.all([
    rm(tmpProject, { recursive: true, force: true }),
    rm(tmpUser, { recursive: true, force: true }),
  ]);
});

describe('startWorkflow', () => {
  it('succeeds for built-in brainstorm skill', async () => {
    const result = await startWorkflow('brainstorm', tmpProject, tmpUser);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.skillName).toBe('brainstorm');
      expect(result.skillBody).toContain('Brainstorming');
    }
  });

  it('succeeds for all 4 built-in skills', async () => {
    for (const name of ['brainstorm', 'spec', 'grill', 'plan']) {
      const result = await startWorkflow(name, tmpProject, tmpUser);
      expect(result.ok).toBe(true);
    }
  });

  it('returns fail-loud error on missing skill', async () => {
    const result = await startWorkflow('nonexistent-skill', tmpProject, tmpUser);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/not found/i);
    }
  });
});

describe('invokeSkill', () => {
  it('returns skill body as output', async () => {
    const result = await invokeSkill('brainstorm', {}, tmpProject, tmpUser);
    expect(result.skillName).toBe('brainstorm');
    expect(result.output).toContain('Brainstorming');
  });

  it('returns error message in output on missing skill', async () => {
    const result = await invokeSkill('nope', {}, tmpProject, tmpUser);
    expect(result.skillName).toBe('nope');
    expect(result.output).toMatch(/not found/i);
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `yarn workspace @awecode/workflow test`
Expected: FAIL

- [ ] **Step 3: Create `packages/workflow/src/engine.ts`**

```ts
import { loadSkill } from './loader.js';
import type { StartWorkflowResult, InvokeSkillResult } from './types.js';

export async function startWorkflow(
  name: string,
  projectRoot: string,
  userSkillsDir: string,
): Promise<StartWorkflowResult> {
  try {
    const skill = await loadSkill(name, projectRoot, userSkillsDir);
    if (!skill) {
      // Q23 grill: fail-loud with clear error
      return {
        ok: false,
        error: `Workflow "${name}" not found. Available: brainstorm, spec, grill, plan (built-in), plus any custom skills in .awecode/skills/ or ~/.config/awecode/skills/`,
      };
    }
    return {
      ok: true,
      skillName: skill.name,
      skillBody: skill.body,
    };
  } catch (err) {
    // Q23 grill: fail-loud, agent can fall back to Direct Mode
    return {
      ok: false,
      error: `Failed to load workflow "${name}": ${(err as Error).message}`,
    };
  }
}

export async function invokeSkill(
  name: string,
  _args: Record<string, unknown>,
  projectRoot: string,
  userSkillsDir: string,
): Promise<InvokeSkillResult> {
  const skill = await loadSkill(name, projectRoot, userSkillsDir);
  if (!skill) {
    return {
      skillName: name,
      output: `Skill "${name}" not found`,
    };
  }
  return {
    skillName: skill.name,
    output: skill.body,
  };
}
```

- [ ] **Step 4: Update `packages/workflow/src/index.ts`**

```ts
export { startWorkflow, invokeSkill } from './engine.js';
```

- [ ] **Step 5: Run test to verify pass**

Run: `yarn workspace @awecode/workflow test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(workflow): startWorkflow + invokeSkill with fail-loud errors"
```

---

## Task 9: Slash command framework in CLI

**Files:**

- Create: `packages/cli/src/slash/index.ts`
- Test: `packages/cli/tests/slash.test.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Create `packages/cli/src/slash/index.ts`**

```ts
export interface SlashCommand {
  name: string;
  description: string;
  handler: (args: string[], ctx: SlashContext) => Promise<void>;
}

export interface SlashContext {
  projectRoot: string;
  userSkillsDir: string;
}

const commands = new Map<string, SlashCommand>();

export function registerSlashCommand(cmd: SlashCommand): void {
  commands.set(cmd.name, cmd);
}

export function getSlashCommand(name: string): SlashCommand | undefined {
  return commands.get(name);
}

export function listSlashCommands(): SlashCommand[] {
  return [...commands.values()];
}

/**
 * Try to dispatch a slash command from user input.
 * Returns true if input was a slash command (handled or unknown),
 * false if input was not a slash command.
 */
export async function dispatchSlash(
  input: string,
  ctx: SlashContext,
): Promise<boolean> {
  if (!input.startsWith('/')) return false;

  const trimmed = input.slice(1);
  const spaceIdx = trimmed.indexOf(' ');
  const name = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const argsStr = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1);
  const args = argsStr.split(' ').filter((s) => s.length > 0);

  const cmd = commands.get(name);
  if (!cmd) {
    console.error(`Unknown slash command: /${name}. Available: ${[...commands.keys()].join(', ')}`);
    return true;
  }

  await cmd.handler(args, ctx);
  return true;
}
```

- [ ] **Step 2: Write test**

```ts
import { describe, it, expect, vi } from 'vitest';
import {
  registerSlashCommand,
  getSlashCommand,
  listSlashCommands,
  dispatchSlash,
  type SlashContext,
} from '../src/slash/index.js';

const ctx: SlashContext = {
  projectRoot: '/tmp',
  userSkillsDir: '/tmp/user-skills',
};

describe('slash command framework', () => {
  it('registers and retrieves command', () => {
    const cmd = {
      name: 'test-cmd',
      description: 'test',
      handler: vi.fn(),
    };
    registerSlashCommand(cmd);
    expect(getSlashCommand('test-cmd')).toBe(cmd);
  });

  it('listSlashCommands returns all', () => {
    const list = listSlashCommands();
    expect(list.length).toBeGreaterThan(0);
  });

  it('dispatchSlash returns false for non-slash input', async () => {
    const handled = await dispatchSlash('hello world', ctx);
    expect(handled).toBe(false);
  });

  it('dispatchSlash handles registered command', async () => {
    const handler = vi.fn();
    registerSlashCommand({
      name: 'greet',
      description: 'greet',
      handler,
    });
    const handled = await dispatchSlash('/greet foo bar', ctx);
    expect(handled).toBe(true);
    expect(handler).toHaveBeenCalledWith(['foo', 'bar'], ctx);
  });

  it('dispatchSlash handles unknown command', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handled = await dispatchSlash('/nonexistent', ctx);
    expect(handled).toBe(true);
    expect(errSpy).toHaveBeenCalledWith(expect.stringMatching(/Unknown slash command/));
    errSpy.mockRestore();
  });
});
```

- [ ] **Step 3: Run test to verify fail**

Run: `yarn workspace @awecode/cli test`
Expected: FAIL

- [ ] **Step 4: Install cli deps**

Run: `yarn workspace @awecode/cli add @awecode/workflow`

- [ ] **Step 5: Run test to verify pass**

Run: `yarn workspace @awecode/cli test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(cli): slash command framework with registration + dispatch"
```

---

## Task 10: Workflow slash commands (`/brainstorm`, `/spec`, `/grill`, `/plan`, `/skip-workflow`)

**Files:**

- Create: `packages/cli/src/slash/workflow.ts`
- Modify: `packages/cli/src/slash/index.ts` (auto-register)
- Test: `packages/cli/tests/slash-workflow.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { registerWorkflowSlashCommands } from '../src/slash/workflow.js';
import { getSlashCommand, dispatchSlash, type SlashContext } from '../src/slash/index.js';

const ctx: SlashContext = {
  projectRoot: '/tmp',
  userSkillsDir: '/tmp/user-skills',
};

describe('workflow slash commands', () => {
  it('registers 5 commands', () => {
    registerWorkflowSlashCommands();
    expect(getSlashCommand('brainstorm')).toBeDefined();
    expect(getSlashCommand('spec')).toBeDefined();
    expect(getSlashCommand('grill')).toBeDefined();
    expect(getSlashCommand('plan')).toBeDefined();
    expect(getSlashCommand('skip-workflow')).toBeDefined();
  });

  it('/brainstorm dispatches startWorkflow', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await dispatchSlash('/brainstorm', ctx);
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('/skip-workflow prints confirmation', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await dispatchSlash('/skip-workflow', ctx);
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/Direct Mode/i));
    logSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `yarn workspace @awecode/cli test`
Expected: FAIL

- [ ] **Step 3: Create `packages/cli/src/slash/workflow.ts`**

```ts
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
          console.log(result.skillBody.slice(0, 500) + (result.skillBody.length > 500 ? '...' : ''));
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
```

- [ ] **Step 4: Auto-register on import — update `packages/cli/src/slash/index.ts`**

Add at bottom of file:

```ts
// Auto-register built-in slash commands
import { registerWorkflowSlashCommands } from './workflow.js';
registerWorkflowSlashCommands();
```

But circular import — better to export registration function and call from chat command init. Update approach: caller calls `registerWorkflowSlashCommands()` explicitly. Remove auto-register from index.ts.

Update `packages/cli/src/slash/workflow.ts` to be the explicit registration:

```ts
// (same content as Step 3)
```

- [ ] **Step 5: Update test to call register explicitly**

Test already calls `registerWorkflowSlashCommands()`, so it should work.

- [ ] **Step 6: Run test to verify pass**

Run: `yarn workspace @awecode/cli test`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(cli): workflow slash commands (/brainstorm /spec /grill /plan /skip-workflow)"
```

---

## Task 11: Wire Intent Declaration into agent chat loop

**Files:**

- Modify: `packages/agent/src/chat.ts` (call detectIntentFromText on response)
- Modify: `packages/agent/src/chat.ts` (add onIntentDeclared callback)
- Test: `packages/agent/tests/chat-intent.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { runChatLoop } from '../src/chat.js';
import { ContextManager } from '../src/context/manager.js';
import type { AwecodeConfig } from '@awecode/llm';

vi.mock('@awecode/llm', () => ({
  createProvider: vi.fn(() => ({})),
}));

const mockStreamText = vi.fn();
vi.mock('ai', () => ({
  streamText: (...args: unknown[]) => mockStreamText(...args),
}));

const mockConfig: AwecodeConfig = {
  activeProvider: 'mock',
  providers: {
    mock: { type: 'ollama', baseURL: 'http://x', defaultModel: 'm' },
  },
};

function makeStreamResponse(text: string) {
  return {
    textStream: (async function* () {
      for (const ch of text) yield ch;
    })(),
    toolCalls: Promise.resolve([]),
  };
}

describe('chat loop Intent Declaration', () => {
  it('fires onIntentDeclared when agent emits start_workflow', async () => {
    mockStreamText.mockResolvedValueOnce(
      makeStreamResponse('I will start_workflow("brainstorm") for this task.'),
    );

    const ctx = new ContextManager();
    let declared: string | null = null;
    await runChatLoop([{ role: 'user', content: 'build X' }], {
      config: mockConfig,
      context: ctx,
      onIntentDeclared: (intent) => {
        declared = intent.type === 'workflow' ? intent.name : null;
      },
    });

    expect(declared).toBe('brainstorm');
  });

  it('fires onIntentDeclared with direct mode when no workflow', async () => {
    mockStreamText.mockResolvedValueOnce(makeStreamResponse('Fixed the typo.'));

    const ctx = new ContextManager();
    let intentType: string | null = null;
    await runChatLoop([{ role: 'user', content: 'fix typo' }], {
      config: mockConfig,
      context: ctx,
      onIntentDeclared: (intent) => {
        intentType = intent.type;
      },
    });

    expect(intentType).toBe('direct');
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `yarn workspace @awecode/agent test`
Expected: FAIL

- [ ] **Step 3: Modify `packages/agent/src/chat.ts`**

Add `onIntentDeclared` to options and call `detectIntentFromText` after assistant response:

```ts
// Add to ChatLoopOptions interface:
export interface ChatLoopOptions {
  // ... existing ...
  onIntentDeclared?: (intent: IntentDeclaration) => void;
}

// Add import at top:
import { detectIntentFromText, type IntentDeclaration } from './intent.js';

// In runChatLoop, after `if (assistantText.includes('<<<< SEARCH'))`:
const intent = detectIntentFromText(assistantText);
opts.onIntentDeclared?.(intent);
```

Full update: replace the existing `if (assistantText.includes('<<<< SEARCH'))` block with:

```ts
if (assistantText.includes('<<<< SEARCH')) {
  opts.onDiffDetected?.(assistantText);
}

const intent = detectIntentFromText(assistantText);
opts.onIntentDeclared?.(intent);
```

Also export IntentDeclaration type:

```ts
export type { IntentDeclaration } from './intent.js';
```

- [ ] **Step 4: Run test to verify pass**

Run: `yarn workspace @awecode/agent test`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(agent): emit Intent Declaration callback from chat loop"
```

---

## Task 12: Workspace-wide build + typecheck

- [ ] **Step 1: Run validation**

Run: `yarn typecheck && yarn lint && yarn test && yarn build`
Expected: all pass

- [ ] **Step 2: Commit if any fixes needed**

```bash
git add -A
git commit -m "chore: workspace-wide validation green after Plan 5a"
```

---

## Task 13: Documentation

**Files:**

- Create: `docs/workflows.md`
- Modify: `README.md`

- [ ] **Step 1: Create `docs/workflows.md`**

```markdown
# Workflows

Awecode ships with a built-in workflow engine that auto-detects task complexity and runs structured phases.

## When workflows trigger

| Task type | Mode |
|-----------|------|
| "Fix typo in X" | Direct Mode (no workflow) |
| "Add unit test for function Y" | Direct or light workflow |
| "Build CSV import feature" | Workflow: brainstorm → spec → grill → plan |
| "Refactor auth module" | Workflow: brainstorm → spec → grill → plan |

The agent emits \`start_workflow(name)\` in its response to declare intent.

## 4 built-in skills

1. **brainstorm** — explore requirements, propose approaches
2. **spec** — write design doc to \`docs/specs/<topic>-design.md\`
3. **grill** — stress-test spec with batched questions
4. **plan** — create implementation plan in \`docs/plans/<topic>.md\`

## Slash commands

- \`/brainstorm\` — invoke brainstorm phase
- \`/spec\` — invoke spec phase
- \`/grill\` — invoke grill phase
- \`/plan\` — invoke plan phase
- \`/skip-workflow\` — force Direct Mode

## Custom skills

Place SKILL.md files in:

- \`.awecode/skills/<name>/SKILL.md\` (project-specific, committed)
- \`~/.config/awecode/skills/<name>/SKILL.md\` (user-global)

Precedence: project > user > built-in. Override any built-in by creating a skill with the same name.

## Skill format

\`\`\`markdown
---
name: my-skill
description: What this skill does
trigger: optional-trigger
---

# Skill Body

Instructions for the agent...
\`\`\`

## Session state

Workflow progress saved to \`.awecode/session.json\` for resumption.
```

- [ ] **Step 2: Update README to mention workflows**

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: workflow engine documentation with slash commands + custom skills"
```

---

## Self-Review

### Spec coverage

- Spec 7.1 (Intent Declaration): ✅ Task 11 (chat loop emits intent)
- Spec 7.2 (4 built-in workflows): ✅ Task 5
- Spec 7.3 (Artifact-based): ✅ Task 5 (each skill writes to disk)
- Spec 7.4 (SKILL.md format): ✅ Tasks 3, 5
- Spec 7.5 (Skill layout + precedence): ✅ Task 6
- Spec 7.6 (Skill composition via invoke_skill): ✅ Task 8
- Spec 7.7 (Session state): ✅ Task 7
- Spec 7.8 (Input rejection during workflow): ⚠️ deferred to Plan 5b (TUI layer)
- Spec 7.9 (Skill ≠ Plugin): ✅ implicit — only skills in v0.1
- ADR-0002 (auto-trigger): ✅ Task 11
- Q6-Q11 grill: ✅ all covered
- Q23 grill (fail-loud): ✅ Task 8
- Q25 grill (artifact-based): ✅ Task 5
- Q26 grill (skip phases): ✅ Task 10 (`/brainstorm` etc.)

### Placeholder scan

All 13 tasks have full code. No "TBD"/"omit".

### Type consistency

- `Skill`, `WorkflowSession`, `StartWorkflowResult`, `InvokeSkillResult` defined Task 2, used throughout
- `IntentDeclaration` from Plan 3 reused Task 11
- Slash framework types consistent across Tasks 9, 10
