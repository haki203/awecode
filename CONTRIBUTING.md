# Contributing to Awecode

Thanks for your interest in contributing! This document covers the basics.

## Code of Conduct

Be kind. Assume good intent. Disagree without insulting. We follow the
[Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/)
in spirit.

## Project layout

```
packages/
├── llm/          # Vercel AI SDK wrapper, multi-provider config
├── diff/         # Aider-style search/replace diff parse + apply (pure leaf)
├── tools/        # File ops + shell tool implementations (pure leaf)
├── agent/        # Chat loop, context manager, intent detect, approval queue
├── harness/      # Git worktree, self-heal loop, merge, commit
├── workflow/     # SKILL.md parser + loader + built-in skills
├── repomap/      # Tree-sitter repo outline with PageRank ranking
├── orchestrator/ # Diff Cycle pipeline wiring chat ↔ harness
└── cli/          # Ink TUI + slash commands + command entrypoint
docs/
├── adr/          # Architecture Decision Records
└── superpowers/  # Design specs + implementation plans
```

**Architectural rule:** dependencies flow left-to-right in the list above.
Leaf packages (`diff`, `tools`, `llm`) must not import from higher packages.
The `cli` package is the only consumer that may import from all others.

## Prerequisites

- Node.js 20 LTS
- Yarn berry v4 (auto-installed via the `packageManager` field in the root
  `package.json`; run `corepack enable` if your Node install doesn't pick it up)
- Git 2.20+ (for worktree features used by `@awecode/harness`)

## Setup

```bash
git clone https://github.com/<your-fork>/awecode.git
cd awecode
yarn install
yarn build
```

## Day-to-day commands

```bash
yarn build          # Build all 9 packages (tsup, parallel, topological)
yarn typecheck      # tsc --noEmit across workspaces
yarn lint           # eslint .
yarn test           # Full test suite (sequential files, ~40s)
yarn test:watch     # Vitest watch mode

# Per-package (faster iteration):
npx vitest run packages/diff/tests/parse.test.ts
yarn workspace @awecode/diff test
```

## Conventions

### Commit messages

We follow [Conventional Commits](https://www.conventionalcommits.org/) with
an `awecode:` prefix to distinguish our commits from model-generated noise in
the same repo:

```
awecode: feat(orchestrator): add phase transition for self-heal retry
awecode: fix(harness): diffFailStreak counter was reset too early
awecode: docs: clarify worktree lifecycle in CONTEXT.md
awecode: chore: bump vitest to 4.2
```

Scopes match package names without the `@awecode/` prefix (`agent`,
`cli`, `diff`, `harness`, `llm`, `orchestrator`, `repomap`, `tools`,
`workflow`). Use `docs` or `chore` for cross-package work.

### TypeScript

Every `src/*.ts` file starts with the Apache 2.0 header (see
`packages/diff/src/index.ts:1-13` for the canonical text). Tests do **not**
carry the header.

Each package's `tsconfig.json` extends `../../tsconfig.base.json` and sets
`typeRoots`/`types: ["node"]`/`ignoreDeprecations: "6.0"`. Use
`verbatimModuleSyntax` and `noUncheckedIndexedAccess` (already on in the
base config).

When adding a new package, copy `packages/harness/tsconfig.json` and
`packages/harness/tsup.config.ts` as the baseline.

### Testing

- Follow TDD (red → green → refactor) for bug fixes and new features.
- Tests live in `packages/<name>/tests/` and mirror the source layout.
- Use tmp dirs for filesystem tests (`mkdtemp` in `beforeEach`, `rm` in
  `afterEach`). On Windows, the root `vitest.config.ts` runs test files
  sequentially (`fileParallelism: false`) to avoid EBUSY on temp dirs.
- Prefer integration tests that exercise real git operations over mocked
  ones — see `packages/orchestrator/tests/integration-lifecycle.test.ts`
  for the pattern.

### ESM/CJS interop

The codebase is ESM-only (`"type": "module"`). Several transitive deps
(notably `simple-git` → `@kwsites/file-exists`) still call `require()`.
The `tsup.config.ts` files that bundle these deps carry a `createRequire`
shim banner — keep that banner when modifying tsup configs.

## Adding a new built-in Skill

1. Create `packages/workflow/skills/<name>/SKILL.md` with YAML frontmatter
   (`name`, `description`, optional `trigger`).
2. Register the name in `packages/workflow/src/builtin.ts` (`BUILT_IN_SKILL_NAMES`).
3. Add a slash command in `packages/cli/src/slash/workflow.ts`.
4. Document in `docs/workflows.md`.

## Filing issues

- **Bugs:** include the `awecode --version` output, OS, Node version, and
  the smallest repro you can manage. The output of `awecode --help` if it
  crashes on startup.
- **Features:** describe the user-facing workflow you want, not just the
  implementation. Link to existing issues/PRs if related.

## Pull requests

- Keep PRs small and reviewable. If a change touches multiple packages,
  prefer stacked PRs.
- Include tests. A PR without tests will be returned for revision unless
  it's docs-only.
- Update `CHANGELOG.md` under the `## Unreleased` section.
- Don't edit `yarn.lock` by hand — run `yarn install` to update it.

## License

By contributing, you agree that your contributions are licensed under the
Apache 2.0 license (see `LICENSE`).
