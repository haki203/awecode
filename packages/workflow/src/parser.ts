import { parse } from 'yaml';
import type { Skill, SkillFrontmatter, SkillSource } from './types.js';

const FRONTMATTER_RE = /^---\r?\n([\s\S]+?)\r?\n---(?:\r?\n([\s\S]*))?$/;

export function parseSkillMarkdown(
  content: string,
  filePath: string,
  sourcePath: SkillSource = 'project',
): Skill {
  const match = content.match(FRONTMATTER_RE);
  if (!match || !match[1]) {
    throw new Error(
      `Skill ${filePath} missing frontmatter. Expected ---\n<yaml>\n---\n<markdown body>.`,
    );
  }

  const body = match[2] ?? '';

  let frontmatter: SkillFrontmatter;
  try {
    frontmatter = parse(match[1]) as SkillFrontmatter;
  } catch (err) {
    throw new Error(
      `Skill ${filePath} has malformed YAML frontmatter: ${(err as Error).message}`,
    );
  }

  if (!frontmatter.name || !frontmatter.description) {
    throw new Error(
      `Skill ${filePath} frontmatter must have 'name' and 'description'.`,
    );
  }

  return {
    name: frontmatter.name,
    description: frontmatter.description,
    frontmatter,
    body,
    sourcePath,
    filePath,
  };
}
