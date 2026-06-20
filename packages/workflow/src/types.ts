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
