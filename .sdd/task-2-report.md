# Task 2 Report — Define types (TDD)

**Plan:** `docs/superpowers/plans/2026-06-19-plan4-harness-selfheal.md` § Task 2 (lines 198–327)
**Branch:** `master` (in-place)
**Parent commit:** `c8a96b4` (Task 1 complete)

---

## Summary

Defined the five core types consumed by Tasks 3–9: `Worktree`, `SandboxMode`, `SandboxConfig`, `SelfHealConfig`, and the 8-variant `SelfHealEvent` discriminated union. All type-only exports surfaced from `packages/harness/src/index.ts` via `export type {…} from './types.js'`.

**Status:** ✅ Complete
**Commit:** `e00bb6b` — `feat(harness): define Worktree, SandboxConfig, SelfHealConfig types`
**Tests:** 5 passed / 0 failed (4 new types tests + 1 pre-existing sanity test)

---

## What was built

### Files changed

| File | Action | Notes |
|---|---|---|
| `packages/harness/tests/types.test.ts` | Created | Verbatim from brief Step 1. |
| `packages/harness/src/types.ts` | Created | Verbatim type defs from brief Step 3, **plus Apache license header** (see deviation below). |
| `packages/harness/src/index.ts` | Modified | Added `export type { Worktree, SandboxMode, SandboxConfig, SelfHealConfig, SelfHealEvent } from './types.js';` before `HARNESS_PACKAGE_VERSION`. Apache header and version export preserved unchanged. |

### Type surface

- `interface Worktree { uuid, path, branch, createdAt }` — worktree identity record.
- `type SandboxMode = 'git-only' | 'docker'` — sandbox selector.
- `interface SandboxConfig { mode, isolateNetwork, commandTimeout, totalTimeout }`.
- `interface SelfHealConfig` — the **5 guards** (Q2 grill hybrid control): `maxSteps`, `maxConsecutiveSameError`, `totalTimeout`, `commandTimeout`, `diffFailStreak`.
- `type SelfHealEvent` — discriminated union with **8 variants**: `step_start`, `command_start`, `command_done`, `diff_applied`, `consecutive_same_error`, `step_cap_reached`, `user_takeover`, `success`.

---

## TDD cycle

### RED — ⚠️ silent RED (see Concerns)

Ran the failing test before creating `types.ts`:

```
$ npx vitest run packages/harness/tests/types.test.ts
PASS (4) FAIL (0)   ← all 4 tests pass at runtime
```

The test passed **even though `src/types.ts` did not exist**. Verified the module is genuinely missing via a direct runtime import:

```
$ node -e "import('./packages/harness/src/types.js').then(...).catch(e => console.log('ERR:', e.code))"
ERR: ERR_MODULE_NOT_FOUND
```

**Why vitest didn't RED:** Every import in the test is `import type {…}`. With `verbatimModuleSyntax: true` (set in `tsconfig.base.json`), esbuild/swc **erases type-only imports entirely** at transform time — they produce zero runtime module resolution. The test's value-level assertions (`expect(wt.uuid).toBe('abc-123')`) operate on plain object literals and pass regardless.

Additionally, `tsc --noEmit -p tsconfig.json` did not catch the missing module because the harness `tsconfig.json` excludes `tests/` from compilation (`"exclude": ["dist", "tests"]`). So neither runtime nor the package's own typecheck surfaces the missing-file error for this test file.

The brief's expected RED message — *"Cannot find module '../src/types.js'"* — is a TypeScript compiler diagnostic, not a vitest runtime error, and would only appear if (a) tests were included in the typecheck and (b) a typecheck step was part of the test command. Neither is the case in this repo's current setup.

### GREEN

After creating `src/types.ts` and updating `src/index.ts`:

```
$ npx vitest run packages/harness/tests/types.test.ts packages/harness/tests/sanity.test.ts
PASS (5) FAIL (0)
```

```
$ npx tsc --noEmit -p packages/harness/tsconfig.json
TypeScript: No errors found
```

All 5 tests pass (4 types + 1 sanity), typecheck clean.

---

## Deviation: license header on `types.ts`

**The brief and the task instructions disagree with the actual repo convention.**

- Brief Step 3 shows `types.ts` content **without** a license header.
- Task instructions assert: *"types files in sibling packages do NOT carry the license header (only `index.ts` does). Confirm by checking `packages/diff/src/types.ts`."*

**Actual repo state** — all three sibling packages that have a `src/types.ts` **do** carry the Apache 2.0 header:

| File | Header? |
|---|---|
| `packages/diff/src/types.ts` | ✅ Yes (lines 1–13) |
| `packages/tools/src/types.ts` | ✅ Yes (lines 1–13) |
| `packages/llm/src/types.ts` | ✅ Yes (lines 1–13) |

**Decision:** Included the license header on `packages/harness/src/types.ts` to match the actual convention across all three sibling packages. The repo is consistent on this; the task instruction's claim is factually incorrect. If the reviewer prefers to omit the header, it's a one-line deletion in a follow-up.

The Apache header text used is byte-identical to the one in `packages/diff/src/types.ts` and in `packages/harness/src/index.ts`.

---

## Self-review

### Completeness
- ✅ Test file matches brief Step 1 verbatim.
- ✅ `types.ts` type definitions match brief Step 3 verbatim.
- ✅ `index.ts` re-export block matches brief Step 4 verbatim, placed before the existing `HARNESS_PACKAGE_VERSION` export. Apache header + version constant preserved.
- ✅ `SelfHealConfig` has all 5 guards (Q2 grill).
- ✅ `SelfHealEvent` has all 8 variants.
- ✅ Commit message matches brief Step 6 verbatim: `feat(harness): define Worktree, SandboxConfig, SelfHealConfig types`.

### Quality
- ✅ Re-export uses `export type {…}` — required under `verbatimModuleSyntax: true` (a value re-export would emit a runtime import of a type-only module and fail).
- ✅ License header consistent with sibling packages.
- ✅ No new dependencies. No `// TODO`, no placeholders.

### Discipline
- ✅ TDD order followed: test written first, verified missing module, then implementation.
- ✅ No scope creep — only the three files in the brief were touched.
- ⚠️  RED was silent (see Concerns). Mitigated by an explicit runtime `ERR_MODULE_NOT_FOUND` proof.

### Testing
- ✅ All harness tests green (5/5).
- ✅ `tsc --noEmit` on harness src green.

---

## Concerns

1. **Silent RED for type-only tests.** Pure `import type` tests cannot RED through `vitest run` under `verbatimModuleSyntax: true`. This affects Task 2 today and any future task whose test imports only types (e.g. parts of Tasks 6–8 if they go type-only). Suggested fixes (out of scope here):
   - Add `tsc --noEmit` (with tests included in a separate `tsconfig.test.json`) to the `test` script, or
   - Add a tiny value-import smoke test (e.g. `expect(Object.keys(await import('../src/types.js'))).toEqual([])`) — though type modules have no runtime exports, so this would always pass too. The clean fix is a typecheck step.
2. **License-header instruction inconsistency.** The brief's "types files don't carry the header" claim is wrong for this repo. Flagging so downstream tasks don't repeat the mistake. All sibling `src/types.ts` files carry the Apache header.
3. **Pre-existing untracked files** (`.sdd/progress.md`, `.sdd/task-1-report.md`, `.sdd/task-1-review.diff`, `node_modules/...`) were left alone — only Task 2's three code files plus this report were staged.

---

## Commands reproducing this task

```powershell
# RED (silent at runtime — module verified missing separately)
npx vitest run packages/harness/tests/types.test.ts

# Implementation: create src/types.ts, edit src/index.ts (see diff)

# GREEN
npx vitest run packages/harness/tests/types.test.ts packages/harness/tests/sanity.test.ts
npx tsc --noEmit -p packages/harness/tsconfig.json

# Commit
git add packages/harness/src/types.ts packages/harness/src/index.ts packages/harness/tests/types.test.ts .sdd/task-2-report.md
git commit -m "feat(harness): define Worktree, SandboxConfig, SelfHealConfig types"
```
