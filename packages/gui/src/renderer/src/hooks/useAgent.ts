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

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ContextEntrySnapshot,
  GuiAgentEvent,
} from '../../../shared/protocol.js';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool' | 'error';
  content: string;
}

export interface AgentStatus {
  model?: string;
  provider?: string;
  cwd?: string;
}

export interface ContextState {
  entries: ContextEntrySnapshot[];
  totalTokens: number;
  budgetTokens: number;
}

export interface UseAgent {
  messages: ChatMessage[];
  status: AgentStatus;
  context: ContextState;
  isStreaming: boolean;
  workflow: { name: string } | null;
  lastError: string | null;
  send: (text: string) => void;
  abort: () => void;
  resetForSession: () => void;
}

/**
 * Subscribes to the agent IPC channel and folds the event stream into a small
 * React state shape. Mirrors the TUI's ChatApp but driven by JSON events
 * instead of runChatLoop callbacks.
 */
export function useAgent(): UseAgent {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<AgentStatus>({});
  const [context, setContext] = useState<ContextState>({
    entries: [],
    totalTokens: 0,
    budgetTokens: 0,
  });
  const [isStreaming, setIsStreaming] = useState(false);
  const [workflow, setWorkflow] = useState<{ name: string } | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const streamingRef = useRef(false);

  useEffect(() => {
    const off = window.awecode.onEvent((ev: GuiAgentEvent) => {
      switch (ev.type) {
        case 'ready':
          setStatus({
            cwd: ev.cwd,
            model: ev.model,
            provider: ev.provider,
          });
          break;
        case 'message':
          if (ev.role === 'tool') {
            setMessages((m) => [
              ...m,
              { role: 'tool', content: ev.content },
            ]);
          } else if (ev.role === 'assistant') {
            setMessages((m) => [
              ...m,
              { role: 'assistant', content: ev.content },
            ]);
          } else {
            setMessages((m) => [
              ...m,
              { role: 'user', content: ev.content },
            ]);
          }
          break;
        case 'token': {
          // Append to the last assistant message; create one if none.
          setMessages((m) => {
            const last = m[m.length - 1];
            if (last && last.role === 'assistant') {
              return [
                ...m.slice(0, -1),
                { ...last, content: last.content + ev.chunk },
              ];
            }
            return [...m, { role: 'assistant', content: ev.chunk }];
          });
          break;
        }
        case 'tool_call':
          setMessages((m) => [
            ...m,
            { role: 'tool', content: `call ${ev.name}` },
          ]);
          break;
        case 'diff_detected':
          setMessages((m) => [
            ...m,
            { role: 'tool', content: 'detected diff → orchestrator' },
          ]);
          break;
        case 'intent':
          setWorkflow(ev.intent === 'workflow' ? { name: ev.name ?? '?' } : null);
          break;
        case 'context_snapshot':
          setContext({
            entries: ev.entries,
            totalTokens: ev.totalTokens,
            budgetTokens: ev.budgetTokens,
          });
          break;
        case 'error':
          setLastError(ev.message);
          setMessages((m) => [
            ...m,
            { role: 'error', content: ev.message },
          ]);
          break;
        case 'done':
          streamingRef.current = false;
          setIsStreaming(false);
          break;
      }
    });
    return off;
  }, []);

  const send = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (streamingRef.current) return;
    streamingRef.current = true;
    setIsStreaming(true);
    setLastError(null);
    // Do NOT optimistically echo here — the CLI's internal-mode protocol
    // server emits a 'message'/'user' event back, which useAgent appends.
    // Echoing here too would double the user's message.
    void window.awecode.send({ type: 'prompt', text });
  }, []);

  const abort = useCallback(() => {
    if (!streamingRef.current) return;
    void window.awecode.send({ type: 'abort' });
  }, []);

  /**
   * Clear all transcript/UI state. Called when the user switches to a
   * different conversation — the bridge will emit a fresh 'ready' followed
   * by replay events if the session has history. Not an abort: an in-flight
   * stream is killed by the bridge when it switches.
   */
  const resetForSession = useCallback(() => {
    setMessages([]);
    setStatus({});
    setContext({ entries: [], totalTokens: 0, budgetTokens: 0 });
    setIsStreaming(false);
    setWorkflow(null);
    setLastError(null);
    streamingRef.current = false;
  }, []);

  return {
    messages,
    status,
    context,
    isStreaming,
    workflow,
    lastError,
    send,
    abort,
    resetForSession,
  };
}
