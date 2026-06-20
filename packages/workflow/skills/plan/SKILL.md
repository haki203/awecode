---
name: plan
description: Create a detailed implementation plan from the spec. Bite-sized tasks with full code, test code, and commit messages.
trigger: after-grill
---

# Writing the Implementation Plan

Write a comprehensive implementation plan assuming the engineer has zero context.

## Plan header

````markdown
# [Feature] Implementation Plan

**Goal:** [one sentence]
**Architecture:** [2-3 sentences]
**Tech Stack:** [key technologies]
````

## Task structure (TDD)

Each task follows red-green-refactor:

````markdown
### Task N: [Component]

**Files:**
- Create: `exact/path/to/file.ts`
- Test: `tests/exact/path.ts`

**Interfaces:**
- Consumes: [from earlier tasks]
- Produces: [for later tasks]

- [ ] **Step 1: Write failing test**
<actual test code>

- [ ] **Step 2: Run test to verify fail**
Run: `yarn test`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**
<actual code>

- [ ] **Step 4: Run test to verify pass**
Run: `yarn test`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git commit -m "feat: ..."
```
````

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
