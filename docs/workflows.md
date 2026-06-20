# Workflows

Awecode ships with a built-in workflow engine that auto-detects task complexity and runs structured phases.

## When workflows trigger

| Task type | Mode |
|-----------|------|
| "Fix typo in X" | Direct Mode (no workflow) |
| "Add unit test for function Y" | Direct or light workflow |
| "Build CSV import feature" | Workflow: brainstorm → spec → grill → plan |
| "Refactor auth module" | Workflow: brainstorm → spec → grill → plan |

The agent emits `start_workflow(name)` in its response to declare intent.

## 4 built-in skills

1. **brainstorm** — explore requirements, propose approaches
2. **spec** — write design doc to `docs/specs/<topic>-design.md`
3. **grill** — stress-test spec with batched questions
4. **plan** — create implementation plan in `docs/plans/<topic>.md`

## Slash commands

- `/brainstorm` — invoke brainstorm phase
- `/spec` — invoke spec phase
- `/grill` — invoke grill phase
- `/plan` — invoke plan phase
- `/skip-workflow` — force Direct Mode

## Custom skills

Place SKILL.md files in:

- `.awecode/skills/<name>/SKILL.md` (project-specific, committed)
- `~/.config/awecode/skills/<name>/SKILL.md` (user-global)

Precedence: project > user > built-in. Override any built-in by creating a skill with the same name.

## Skill format

```markdown
---
name: my-skill
description: What this skill does
trigger: optional-trigger
---

# Skill Body

Instructions for the agent...
```

## Session state

Workflow progress saved to `.awecode/session.json` for resumption.
