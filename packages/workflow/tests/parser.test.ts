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
