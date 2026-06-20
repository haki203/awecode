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
