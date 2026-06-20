import { describe, it, expect } from 'vitest';
import { getBuiltInSkillsDir, listBuiltInSkillNames } from '../src/builtin.js';

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
