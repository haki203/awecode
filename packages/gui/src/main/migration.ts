// Copyright 2026 Awecode Contributors. Apache-2.0.
import { listSessions, loadSession, deleteSession } from './sessions.js';
import type { SessionMessage } from './sessions.js';

/**
 * One-shot migration for the v0.1 → v0.2 session schema change that added
 * `toolCallId` / `toolName` to tool messages.
 *
 * Policy (per user decision 2026-06-22): "fresh start" — delete any session
 * JSON whose tool messages lack the new correlation fields. This avoids
 * ambiguity when resume's transform tries to pair tool_call markers with
 * results on legacy transcripts.
 *
 * Sessions with no tool messages are kept (nothing to correlate). Sessions
 * whose tool messages all have `toolCallId` set are kept. Idempotent.
 */
export function migrateSessionsDir(): { deleted: string[]; kept: string[] } {
  const metas = listSessions();
  const deleted: string[] = [];
  const kept: string[] = [];

  for (const m of metas) {
    const s = loadSession(m.id);
    if (!s) continue;

    const needsWipe = s.messages.some(
      (msg: SessionMessage) => msg.role === 'tool' && !msg.toolCallId,
    );

    if (needsWipe) {
      deleteSession(s.id);
      deleted.push(s.id);
    } else {
      kept.push(s.id);
    }
  }

  if (deleted.length > 0) {
    console.log(
      `[awecode] migration: deleted ${deleted.length} legacy session(s) without toolCallId; kept ${kept.length}.`,
    );
  }

  return { deleted, kept };
}
