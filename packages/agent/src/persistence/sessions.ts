// Copyright 2026 Awecode Contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/**
 * Conversation history for the GUI.
 *
 * Each session is a JSON file under `~/.awecode/sessions/<id>.json` so the
 * user can see past conversations across restarts. We only persist what the
 * renderer needs for the sidebar + transcript replay; the CLI child process
 * remains stateless and is restarted when a session is resumed (the
 * transcript is fed back via the existing NDJSON protocol — future work).
 *
 * For v0.1 we just keep the messages array and metadata. Resume-by-replay is
 * a follow-up; the sidebar lists, deletes, and renames sessions today.
 */

export interface SessionMessage {
  role: 'user' | 'assistant' | 'tool' | 'error';
  content: string;
  ts: number;
  /**
   * Correlation id linking a tool-call message to its tool-result message.
   * Required by OpenAI/Anthropic when replaying a transcript back into the
   * model. Omitted on legacy session JSONs (pre-resume feature); the resume
   * transform generates synthetic ids for those.
   */
  toolCallId?: string;
  /**
   * Name of the invoked tool, separate from the human-readable `content`.
   * Lets the resume transform emit a proper `ToolModelMessage` with a
   * `toolName` field instead of parsing it out of the content string.
   */
  toolName?: string;
  /**
   * JSON-serialized arguments the model supplied when invoking the tool.
   * Stored for debugging and potential future replay needs. Not required
   * for resume (the result is what matters, not the original args).
   */
  toolCallArgs?: string;
}

export interface SessionMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  cwd: string;
  model?: string;
  provider?: string;
}

/**
 * Persisted form of a {@link ContextEntry}. Stored under
 * `Session.contextEntries` so the StatusBar can rebuild the % context used
 * meter accurately after resume, instead of always showing 0%.
 *
 * Kept in sync with `ContextEntry` in `@awecode/agent`. We define a fresh
 * interface (rather than re-using `ContextEntry`) because:
 *   1. Avoids a workspace cycle (`agent/persistence` → `agent/context`).
 *   2. Survives schema drift between the persistence file format and the
 *      in-memory `ContextEntry` shape if either evolves.
 */
export interface ContextEntryRecord {
  id: string;
  type: string;
  path?: string;
  lines?: { start: number; end: number };
  content: string;
  tokens: number;
  addedAt: number;
  addedBy: 'user' | 'agent';
}

export interface Session extends SessionMeta {
  messages: SessionMessage[];
  /**
   * Snapshot of the ContextManager's entries at save time. Optional so
   * session JSON files written before this field was introduced (v0.1 and
   * earlier) still load — callers fall back to reconstructing entries from
   * `messages[]` when this is undefined.
   */
  contextEntries?: ContextEntryRecord[];
  /** Snapshot of the model's context budget at save time. */
  contextBudgetTokens?: number;
}

const SESSIONS_DIR = resolve(
  process.env.AWECODE_SESSIONS_DIR ??
    join(homedir(), '.awecode', 'sessions'),
);

/**
 * Session ids must be safe filenames: alphanumerics, underscore, hyphen.
 * Rejects anything containing path separators or traversal sequences.
 * Returns the id if valid, or null if unsafe. This is the canonical
 * defense against path-traversal attacks via crafted session ids — every
 * function below relies on it to prevent escaping SESSIONS_DIR.
 */
function safeSessionId(id: string): string | null {
  return /^[A-Za-z0-9_-]+$/.test(id) ? id : null;
}

function sessionPath(id: string): string {
  return join(SESSIONS_DIR, `${id}.json`);
}

export function ensureSessionsDir(): void {
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

export function listSessions(): SessionMeta[] {
  ensureSessionsDir();
  const files = readdirSync(SESSIONS_DIR).filter((f) => f.endsWith('.json'));
  const metas: SessionMeta[] = [];
  for (const f of files) {
    try {
      const raw = readFileSync(join(SESSIONS_DIR, f), 'utf8');
      const s = JSON.parse(raw) as Session;
      metas.push(stripMessages(s));
    } catch {
      // Corrupt file — skip. Don't crash the whole listing.
    }
  }
  metas.sort((a, b) => b.updatedAt - a.updatedAt);
  return metas;
}

/**
 * Same as listSessions but filtered to a single workspace path. Used by the
 * sidebar so switching projects doesn't bleed another project's history in.
 */
export function listSessionsInWorkspace(cwd: string): SessionMeta[] {
  const target = resolve(cwd);
  return listSessions().filter((s) => resolve(s.cwd) === target);
}

export function loadSession(id: string): Session | null {
  if (safeSessionId(id) === null) return null;
  const p = sessionPath(id);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Session;
  } catch {
    return null;
  }
}

export function saveSession(s: Session): void {
  if (safeSessionId(s.id) === null) return;
  ensureSessionsDir();
  const dir = dirname(sessionPath(s.id));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(sessionPath(s.id), JSON.stringify(s, null, 2));
}

export function deleteSession(id: string): void {
  if (safeSessionId(id) === null) return;
  const p = sessionPath(id);
  if (existsSync(p)) rmSync(p, { force: true });
}

export function renameSession(id: string, title: string): SessionMeta | null {
  if (safeSessionId(id) === null) return null;
  const s = loadSession(id);
  if (!s) return null;
  s.title = title.slice(0, 120) || s.title;
  s.updatedAt = Date.now();
  saveSession(s);
  return stripMessages(s);
}

function stripMessages(s: Session): SessionMeta {
  // Avoid leaking the full transcript + context snapshot to the sidebar
  // list. Only metadata.
  const { messages: _messages, contextEntries: _ctx, contextBudgetTokens: _cb, ...meta } = s;
  void _messages;
  void _ctx;
  void _cb;
  return meta as SessionMeta;
}

/**
 * Default placeholder title for brand-new sessions that have no messages
 * yet. Mirrors Cursor / ChatGPT — "New chat" shows in the sidebar until
 * the user sends their first message, at which point we derive a real
 * title from it.
 */
export const DEFAULT_TITLE = 'New chat';

/**
 * Derive a short title from the first user message. Returns the sentinel
 * `DEFAULT_TITLE` when there's no user turn yet — callers should keep
 * that sentinel until a real message arrives.
 */
export function deriveTitle(messages: SessionMessage[]): string {
  const first = messages.find((m) => m.role === 'user');
  if (!first) return DEFAULT_TITLE;

  let t = first.content;

  // Drop fenced code blocks entirely (```...```).
  t = t.replace(/```[\s\S]*?```/g, '');

  // Strip inline code spans (`code`).
  t = t.replace(/`([^`]+)`/g, '$1');

  // Strip bold (**text**) and italic (*text* / _text_).
  t = t.replace(/\*\*([^*]+)\*\*/g, '$1');
  t = t.replace(/(^|[^*])\*([^*]+)\*/g, '$1$2');
  t = t.replace(/(?<!\w)_([^_]+)_(?!\w)/g, '$1');

  // Strip leading @-mentions (e.g. "@agent") and any slash commands
  // (e.g. "/compact"). The two patterns can appear in any order or
  // combination at the start of the message. Only leading ones — inline
  // @refs to files are often meaningful content.
  t = t.replace(/^\s*(?:@[A-Za-z0-9_-]+\s+)*(?:\/[A-Za-z0-9_-]+\s*)*/, '');

  // Collapse whitespace (newlines → spaces) and trim.
  t = t.replace(/\s+/g, ' ').trim();

  // First sentence only — split on `. ` (period followed by space).
  // Note: we intentionally do NOT split on `?` or `!` because users often
  // write rhetorical questions followed by the real ask
  // (e.g. "why does this fail? pls explain") and splitting there would
  // drop meaningful context from the title.
  const sentenceEnd = t.search(/\.\s/);
  if (sentenceEnd !== -1) t = t.slice(0, sentenceEnd + 1);

  if (!t) return DEFAULT_TITLE;

  return t.length > 50 ? `${t.slice(0, 47)}…` : t;
}
