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

import type { GuiAgentEvent } from '@awecode/gui/shared/protocol';
import type { Session, SessionMessage } from './sessions.js';
import { DEFAULT_TITLE, deriveTitle } from './sessions.js';

/**
 * Fold one agent event into a Session record. Mutates `session` in place.
 *
 * Pure with respect to I/O — does not write to disk itself. Callers should
 * call `saveSession(session)` afterwards if persistence is desired.
 *
 * Mirrors the behavior of `AgentBridge.handle` in @awecode/gui/main, so
 * Desktop and Web share identical persistence semantics. See ADR-0007.
 *
 * Note on token coalescing: when a `token` event arrives and the most
 * recent message is an assistant message, we append the chunk to that
 * message's content rather than pushing a new one. This matches the
 * original bridge behavior (which tracked `pendingAssistant` explicitly)
 * but expressed in a stateless way that any caller can invoke.
 */
export function applyEvent(session: Session, ev: GuiAgentEvent): void {
  const now = Date.now();
  switch (ev.type) {
    case 'ready':
      session.cwd = ev.cwd;
      if (ev.model) session.model = ev.model;
      if (ev.provider) session.provider = ev.provider;
      break;
    case 'message': {
      const msg: SessionMessage = {
        role: ev.role === 'tool' ? 'tool' : ev.role,
        content: ev.content,
        ts: now,
      };
      session.messages.push(msg);
      // Promote "New chat" to a real title only on the first user turn.
      // Keep user-renamed titles intact.
      if (ev.role === 'user' && session.title === DEFAULT_TITLE) {
        session.title = deriveTitle(session.messages);
      }
      break;
    }
    case 'token': {
      const last = session.messages[session.messages.length - 1];
      if (last && last.role === 'assistant') {
        last.content += ev.chunk;
      } else {
        session.messages.push({ role: 'assistant', content: ev.chunk, ts: now });
      }
      break;
    }
    case 'tool_call':
      session.messages.push({
        role: 'tool',
        content: `call ${ev.name}`,
        ts: now,
      });
      break;
    case 'done':
      // No state change; callers use this for streaming UI bookkeeping.
      break;
    case 'error':
      session.messages.push({
        role: 'error',
        content: ev.message,
        ts: now,
      });
      break;
    case 'context_snapshot':
    case 'intent':
    case 'diff_detected':
      // No persistence change.
      break;
  }
  session.updatedAt = now;
}
