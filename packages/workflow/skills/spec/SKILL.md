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
