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

import { randomUUID } from 'node:crypto';
import type { ModelMessage } from 'ai';
import { runChatLoop as defaultRunChatLoop } from './chat.js';
import type { ContextManager } from './context/manager.js';
import { ApprovalQueue } from './approval.js';
import type { AwecodeConfig } from '@awecode/llm';
import type { GuiAgentEvent, ContextEntrySnapshot } from '@awecode/gui/shared/protocol';

/**
 * Structural stand-in for the bits of `@awecode/orchestrator`'s `Orchestrator`
 * we use. Defined locally (rather than imported) because `@awecode/orchestrator`
 * depends on `@awecode/agent` — a static import here would create a workspace
 * cycle that breaks the package's DTS build (TS5055). The real `Orchestrator`
 * class satisfies this interface structurally; we load it via dynamic import
 * inside `onDiffDetected` so neither esbuild nor tsup's DTS worker follows the
 * edge. See ADR-0007.
 */
interface OrchestratorLike {
  handleDiffDetected(diff: string): Promise<{
    success: boolean;
    mergedFiles: string[];
    error?: string;
  }>;
}

export interface ProtocolSessionOptions {
  config: AwecodeConfig;
  context: ContextManager;
  cwd: string;
  /** Caller-provided event sink. Receives every GuiAgentEvent the session emits. */
  send: (ev: GuiAgentEvent) => void;
  /** Override for tests; defaults to the real runChatLoop. */
  runChatLoop?: typeof defaultRunChatLoop;
  /**
   * Initial conversation transcript to seed the agent with, used when
   * resuming a persisted session. When provided, `liveMessages` starts as
   * a copy of this array and each subsequent prompt appends to it rather
   * than resetting. When omitted, the session starts empty (legacy behavior).
   */
  initialMessages?: ModelMessage[];
}

export interface ProtocolSession {
  handlePrompt(text: string): Promise<void>;
  abort(): void;
  dispose(): void;
  /**
   * Seed `liveMessages` with a prior transcript. Idempotent — subsequent
   * calls append. Used by transports that receive a `resume` command from
   * the parent after the session has already started (e.g. Desktop
   * AgentBridge.switchTo sends resume right after spawning the child).
   */
  resume(messages: ModelMessage[]): void;
}

export function createProtocolSession(opts: ProtocolSessionOptions): ProtocolSession {
  const runChatLoop = opts.runChatLoop ?? defaultRunChatLoop;
  let liveMessages: ModelMessage[] = opts.initialMessages ? [...opts.initialMessages] : [];
  let abortController: AbortController | null = null;
  let orchestrator: OrchestratorLike | null = null;
  const queueRef = { current: new ApprovalQueue() };

  function snapshotContext(): {
    entries: ContextEntrySnapshot[];
    totalTokens: number;
    budgetTokens: number;
  } {
    const entries = opts.context.snapshot().map((e) => ({
      type: e.type,
      label:
        e.path ??
        (e.lines ? `${e.type}:${e.lines.start}-${e.lines.end}` : e.type),
      tokens: e.tokens,
    }));
    return {
      entries,
      totalTokens: opts.context.totalTokens,
      budgetTokens: opts.context.budgetTokens,
    };
  }

  function emit(ev: GuiAgentEvent): void {
    opts.send(ev);
  }

  // Initial handshake.
  emit({
    type: 'ready',
    cwd: opts.cwd,
    model: opts.config.providers[opts.config.activeProvider]?.defaultModel,
    provider: opts.config.activeProvider,
  });
  emit({ type: 'context_snapshot', ...snapshotContext() });

  async function handlePrompt(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;
    emit({ type: 'message', role: 'user', content: trimmed });

    liveMessages.push({ role: 'user', content: trimmed });
    abortController = new AbortController();

    try {
      await runChatLoop(liveMessages, {
        config: opts.config,
        context: opts.context,
        abortSignal: abortController.signal,
        onToken: (chunk) => emit({ type: 'token', chunk }),
        onToolCall: (name) => emit({ type: 'tool_call', name }),
        onDiffDetected: (diff) => {
          void (async () => {
            try {
              if (!orchestrator) {
                // Dynamic import avoids a static workspace cycle
                // (agent → orchestrator → agent). The real Orchestrator
                // class satisfies OrchestratorLike structurally.
                const { Orchestrator } = await import('@awecode/orchestrator');
                orchestrator = new Orchestrator({
                  projectRoot: opts.cwd,
                  context: opts.context,
                  approvalQueue: queueRef.current,
                  taskUuid: randomUUID(),
                  abortSignal: abortController!.signal,
                  chatMessages: liveMessages,
                });
              }
              const result = await orchestrator.handleDiffDetected(diff);
              emit({
                type: 'message',
                role: 'tool',
                content: result.success
                  ? `applied: ${result.mergedFiles.join(', ')}`
                  : `failed: ${result.error ?? 'unknown'}`,
              });
              emit({ type: 'context_snapshot', ...snapshotContext() });
            } catch (err) {
              emit({
                type: 'error',
                message: `[orchestrator] ${(err as Error).message}`,
              });
            }
          })();
        },
        onIntentDeclared: (intent) => {
          if (intent.type === 'workflow') {
            emit({ type: 'intent', intent: 'workflow', name: intent.name });
          } else {
            emit({ type: 'intent', intent: 'direct', name: null });
          }
        },
        onContextUpdate: () => {
          // Mid-turn snapshot so StatusBar / ContextPanel in GUI and Web
          // update as tokens accumulate, not just once at onDone. This
          // mirrors the CLI's `setContextVersion` re-render trigger.
          emit({ type: 'context_snapshot', ...snapshotContext() });
        },
        onDone: () => {
          emit({ type: 'context_snapshot', ...snapshotContext() });
          emit({ type: 'done' });
        },
      });
    } catch (err) {
      const isAbort =
        err instanceof Error &&
        (err.name === 'AbortError' ||
          (err as { code?: string }).code === 'ABORT_ERR');
      if (isAbort) {
        emit({ type: 'message', role: 'assistant', content: '[aborted]' });
      } else {
        emit({
          type: 'error',
          message: (err as Error).message,
        });
      }
      emit({ type: 'done' });
    } finally {
      abortController = null;
    }
  }

  function abort(): void {
    abortController?.abort();
  }

  function dispose(): void {
    abortController?.abort();
    orchestrator = null;
  }

  function resume(messages: ModelMessage[]): void {
    for (const m of messages) {
      // Skip duplicates when the same seed was already provided via
      // initialMessages or an earlier resume() call. Reference equality
      // is intentional: callers typically pass the same array instance
      // (e.g. the loaded SessionMessage[] -> ModelMessage[] transform).
      if (!liveMessages.some((existing) => existing === m)) {
        liveMessages.push(m);
      }
    }
  }

  return { handlePrompt, abort, dispose, resume };
}
