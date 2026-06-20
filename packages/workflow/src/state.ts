import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { WorkflowSession } from './types.js';

export function getSessionPath(projectRoot: string): string {
  return join(projectRoot, '.awecode', 'session.json');
}

export function createNewSession(): WorkflowSession {
  return {
    taskId: randomUUID(),
    currentWorkflow: null,
    currentPhase: null,
    history: [],
  };
}

export async function loadSession(projectRoot: string): Promise<WorkflowSession | null> {
  try {
    const content = await readFile(getSessionPath(projectRoot), 'utf-8');
    return JSON.parse(content) as WorkflowSession;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function saveSession(projectRoot: string, session: WorkflowSession): Promise<void> {
  const path = getSessionPath(projectRoot);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(session, null, 2), 'utf-8');
}
