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

export interface Session extends SessionMeta {
  messages: SessionMessage[];
}

const SESSIONS_DIR = resolve(
  process.env.AWECODE_SESSIONS_DIR ??
    join(homedir(), '.awecode', 'sessions'),
);

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
  const p = sessionPath(id);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Session;
  } catch {
    return null;
  }
}

export function saveSession(s: Session): void {
  ensureSessionsDir();
  const dir = dirname(sessionPath(s.id));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(sessionPath(s.id), JSON.stringify(s, null, 2));
}

export function deleteSession(id: string): void {
  const p = sessionPath(id);
  if (existsSync(p)) rmSync(p, { force: true });
}

export function renameSession(id: string, title: string): SessionMeta | null {
  const s = loadSession(id);
  if (!s) return null;
  s.title = title.slice(0, 120) || s.title;
  s.updatedAt = Date.now();
  saveSession(s);
  return stripMessages(s);
}

function stripMessages(s: Session): SessionMeta {
  // Avoid leaking the full transcript to the sidebar list. Only metadata.
  const { messages: _messages, ...meta } = s;
  void _messages;
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
  const t = first.content.trim().replace(/\s+/g, ' ');
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
}
