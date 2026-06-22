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

import type { ModelMessage } from 'ai';
import type { SessionMessage } from './persistence/sessions.js';

/**
 * Transform a persisted `Session.messages` array into the `ModelMessage[]`
 * shape that `runChatLoop` consumes, suitable for seeding a fresh agent
 * process when resuming a session.
 *
 * Rules:
 *  - `error` messages are dropped (UI-only, never replayed to the model).
 *  - `user` and `assistant` messages pass through unchanged.
 *  - Each `(tool_call marker, tool result)` pair sharing a `toolCallId`
 *    collapses into ONE `ToolModelMessage` whose content is a single
 *    `tool-result` part (per AI SDK v6). If a marker has no matching result
 *    (session saved mid-call), it is skipped — incomplete tool turns cannot
 *    be replayed.
 *  - Legacy messages without `toolCallId` are paired heuristically: a tool
 *    message whose content starts with "call " is treated as a marker, and
 *    the immediately following tool message is treated as its result.
 *
 * The output is a new array; the input is not mutated.
 */
export function resumeFromMessages(msgs: SessionMessage[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  // Track which result-message indices have already been consumed by an
  // earlier marker. Needed for parallel tool calls where markers appear
  // before results (e.g. [markerA, markerB, resultA, resultB]) — we walk
  // linearly and must not re-emit a result as a stray tool message.
  const consumed = new Set<number>();
  let i = 0;
  while (i < msgs.length) {
    const m = msgs[i]!;
    if (m.role === 'error') {
      i++;
      continue;
    }
    if (m.role === 'user' || m.role === 'assistant') {
      out.push({ role: m.role, content: m.content });
      i++;
      continue;
    }
    // role === 'tool'
    if (consumed.has(i)) {
      // Already folded into a prior marker's ToolModelMessage — skip.
      i++;
      continue;
    }
    if (isToolCallMarker(m)) {
      const result = findMatchingResult(msgs, i, m, consumed);
      if (!result) {
        // Incomplete turn — skip the marker entirely.
        i++;
        continue;
      }
      const toolCallId = m.toolCallId ?? `legacy-${i}`;
      const toolName = m.toolName ?? extractToolNameFromContent(m.content);
      out.push({
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId,
            toolName,
            output: { type: 'text', value: result.content },
          },
        ],
      });
      if (result.index !== undefined) {
        consumed.add(result.index);
      }
      // Always advance by 1 — parallel markers sit between this marker and
      // its result, and they must be visited on subsequent iterations.
      i++;
      continue;
    }
    // A tool result with no preceding marker (malformed or orphan) — skip.
    i++;
  }
  return out;
}

function isToolCallMarker(m: SessionMessage): boolean {
  return m.role === 'tool' && m.content.startsWith('call ');
}

function extractToolNameFromContent(content: string): string {
  // Content shape: "call read_file"
  const parts = content.match(/^call\s+(\S+)/);
  return parts?.[1] ?? 'unknown';
}

function findMatchingResult(
  msgs: SessionMessage[],
  markerIdx: number,
  marker: SessionMessage,
  consumed: Set<number>,
): { content: string; index?: number } | null {
  // Prefer correlation via toolCallId. Scan past other markers and non-
  // matching results — parallel tool calls can produce sequences like
  // [markerA, markerB, resultA, resultB] where the result is NOT the
  // immediately-following message. Skip any index already consumed by a
  // prior marker so we don't double-emit the same result.
  if (marker.toolCallId) {
    for (let j = markerIdx + 1; j < msgs.length; j++) {
      if (consumed.has(j)) continue;
      const candidate = msgs[j]!;
      if (candidate.role !== 'tool') continue;
      if (candidate.toolCallId === marker.toolCallId) {
        return { content: candidate.content, index: j };
      }
    }
    return null;
  }
  // Legacy fallback: take the next non-marker tool message. Only the
  // heuristic path requires immediate adjacency — the toolCallId path
  // above handles correlation correctly across gaps.
  if (markerIdx + 1 < msgs.length && !consumed.has(markerIdx + 1)) {
    const next = msgs[markerIdx + 1]!;
    if (next.role === 'tool' && !isToolCallMarker(next)) {
      return { content: next.content, index: markerIdx + 1 };
    }
  }
  return null;
}
