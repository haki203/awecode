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
 * Find the most recent tool-call marker message that doesn't yet have a
 * following tool-result message correlated to it. Used to pair a tool_call
 * event with the subsequent tool-result content message so they share a
 * `toolCallId` when persisted.
 *
 * A tool-call marker is a tool message with `toolName` set. A subsequent
 * tool message sharing the same `toolCallId` marks it as matched.
 */
function findUnmatchedToolCall(
  messages: SessionMessage[],
): { toolCallId: string; toolName: string } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (!m.toolName || !m.toolCallId) continue;
    // Check if any later message shares this toolCallId — if so, it's matched.
    let matched = false;
    for (let j = i + 1; j < messages.length; j++) {
      if (messages[j]!.toolCallId === m.toolCallId) {
        matched = true;
        break;
      }
    }
    if (!matched) return { toolCallId: m.toolCallId, toolName: m.toolName };
  }
  return null;
}

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
      // If this is a tool-result message, correlate it with the most
      // recent tool_call that hasn't been matched yet.
      if (ev.role === 'tool') {
        const lastUnmatched = findUnmatchedToolCall(session.messages);
        if (lastUnmatched) {
          msg.toolCallId = lastUnmatched.toolCallId;
          msg.toolName = lastUnmatched.toolName;
        }
      }
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
    case 'tool_call': {
      // Generate a stable id from session state alone so the fold stays pure.
      // Count existing tool_call markers (messages carrying a toolName) and
      // use that as the index — id stays the same even if the result message
      // hasn't arrived yet, and the following tool message reuses it via
      // findUnmatchedToolCall.
      const idx = session.messages.filter((m) => m.toolName).length;
      const toolCallId = `call-${idx}-${ev.name}`;
      session.messages.push({
        role: 'tool',
        content: `call ${ev.name}`,
        ts: now,
        toolCallId,
        toolName: ev.name,
      });
      break;
    }
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
    case 'context_snapshot': {
      // Persist the full context snapshot so resume can rebuild the meter.
      // We only store fields needed for StatusBar accuracy + a useful
      // ContextPanel list. Content is preserved so `ContextManager.restore`
      // can recompute tokens if needed (though we also keep the original
      // token count to avoid drift across tokenizer versions).
      session.contextEntries = ev.entries.map((e) => ({
        id: e.id ?? 'restored',
        type: e.type,
        path: e.path,
        lines: e.lines,
        content: e.content ?? e.label,
        tokens: e.tokens ?? 0,
        addedAt: e.addedAt ?? now,
        addedBy: e.addedBy ?? 'agent',
      }));
      session.contextBudgetTokens = ev.budgetTokens;
      break;
    }
    case 'intent':
    case 'diff_detected':
      // No persistence change.
      break;
  }
  session.updatedAt = now;
}
