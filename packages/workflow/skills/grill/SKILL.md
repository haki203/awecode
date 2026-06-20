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

```
Q1. <question>
   Options:
     A. <option A>
     B. <option B>
   Recommend: B
   Why: <one or two sentences>
```

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
