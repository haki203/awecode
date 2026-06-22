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
import { useTransport } from '../transport/context.js';
import type { TransportStatus } from '../transport/context.js';
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
  transportStatus: TransportStatus;
  send: (text: string) => void;
  abort: () => void;
  resetForSession: () => void;
  /**
   * Seed the transcript with persisted messages when a session is reopened.
   * Complements resetForSession (which clears state) by immediately
   * restoring the prior conversation so the user sees their history.
   */
  loadMessages: (msgs: ChatMessage[]) => void;
  /** Register a callback fired whenever the agent's 'done' event arrives. */
  onDone: (cb: () => void) => () => void;
}

/**
 * Subscribes to the agent IPC channel and folds the event stream into a small
 * React state shape. Mirrors the TUI's ChatApp but driven by JSON events
 * instead of runChatLoop callbacks.
 */
export function useAgent(): UseAgent {
  const client = useTransport();
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
  const [transportStatus, setTransportStatus] = useState<TransportStatus>(
    client.getStatus(),
  );
  const streamingRef = useRef(false);
  const doneCbs = useRef(new Set<() => void>());

  useEffect(() => {
    const off = client.onEvent((ev: GuiAgentEvent) => {
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
            // Server echoes the user's text back. Drop it — we already
            // echoed optimistically in send() to avoid the "I sent a
            // message but it didn't appear" UX when the echo is slow or
            // lost (e.g. socket drops mid-turn).
            break;
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
          doneCbs.current.forEach((cb) => cb());
          break;
      }
    });
    return off;
  }, [client]);

  /**
   * Connection watchdog. When the transport drops while a stream is in
   * flight, the server's terminal `done` event is lost (it's only emitted
   * over the live socket), so `isStreaming` would hang on `true` forever
   * and the prompt would stay disabled — manifesting as a stuck "agent is
   * working…" state with no way to send another message. On any transition
   * away from 'open', if we believe we're streaming, surface a synthetic
   * error message and flip streaming off so the user can retry.
   */
  useEffect(() => {
    const off = client.onStatus((s) => {
      setTransportStatus(s);
      if (s !== 'open' && streamingRef.current) {
        streamingRef.current = false;
        setIsStreaming(false);
        setMessages((m) => [
          ...m,
          {
            role: 'error',
            content:
              s === 'closed'
                ? 'connection lost — message not delivered. Reconnecting…'
                : 'reconnecting…',
          },
        ]);
      }
    });
    return off;
  }, [client]);

  const send = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (streamingRef.current) return;
    streamingRef.current = true;
    setIsStreaming(true);
    setLastError(null);
    // Echo the user's message immediately so the user sees it in the
    // transcript even if the server's echo is slow or the socket dies
    // before the echo frame arrives. The server-sent `message`/`user`
    // echo is dropped in the onEvent handler above to avoid duplication.
    setMessages((m) => [...m, { role: 'user', content: trimmed }]);
    void client.send({ type: 'prompt', text });
  }, [client]);

  const abort = useCallback(() => {
    if (!streamingRef.current) return;
    void client.send({ type: 'abort' });
  }, [client]);

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

  /**
   * Seed the transcript with persisted messages when a session is reopened.
   * Called after resetForSession so the user sees their prior conversation
   * rendered in the chat view. Don't touch isStreaming / workflow / context —
   * those will be re-populated by the ready/context_snapshot events from the
   * new session once the agent reconnects.
   */
  const loadMessages = useCallback((msgs: ChatMessage[]) => {
    setMessages(msgs);
  }, []);

  const onDone = useCallback((cb: () => void) => {
    doneCbs.current.add(cb);
    return () => {
      doneCbs.current.delete(cb);
    };
  }, []);

  return {
    messages,
    status,
    context,
    isStreaming,
    workflow,
    lastError,
    transportStatus,
    send,
    abort,
    resetForSession,
    loadMessages,
    onDone,
  };
}
