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

import React, { useState, useRef, useEffect } from 'react';
import { render, Box, useInput, useApp } from 'ink';
import { TextInput } from '@inkjs/ui';
import { randomUUID } from 'node:crypto';
import { loadConfig, getDefaultConfigPath, type AwecodeConfig } from '@awecode/llm';
import {
  ContextManager,
  ApprovalQueue,
  runChatLoop,
} from '@awecode/agent';
import { Orchestrator } from '@awecode/orchestrator';
import type { ModelMessage } from 'ai';
import { ChatView, type ChatMessage } from '../components/ChatView.js';
import { ContextPanel } from '../components/ContextPanel.js';
import { WorkflowIndicator } from '../components/WorkflowIndicator.js';
import { dispatchSlash, type SlashContext } from '../slash/index.js';
import { registerWorkflowSlashCommands } from '../slash/workflow.js';
import { registerCompactionSlashCommands } from '../slash/compaction.js';

interface ChatAppProps {
  context: ContextManager;
  config: AwecodeConfig;
  initialPrompt?: string;
}

function ChatApp({ context, config, initialPrompt }: ChatAppProps) {
  const { exit } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // TextInput from @inkjs/ui v2 is uncontrolled (no `value` prop). We bump
  // `inputKey` after each submit to remount the input, which clears its buffer.
  const [inputKey, setInputKey] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  // Use a ref-backed ApprovalQueue for the Orchestrator's bookkeeping. The
  // orchestrator's `ApprovalPrompter` (readline-based) drives the actual
  // user prompts in v0.1; the queue is kept to dedupe re-emitted blocks
  // across Diff Cycles within a single chat session.
  const queueRef = useRef<ApprovalQueue>(new ApprovalQueue());
  // isStreaming lives in state for rendering, but handleSubmit's early-return
  // guard must read the freshest value to prevent double-submits racing the
  // setState flush. ref mirrors state for synchronous reads inside async paths.
  const streamingRef = useRef(false);
  // Guards the initialPrompt auto-submit against React StrictMode's
  // double-invoke of effects in development.
  const initialSubmitRef = useRef(false);
  // AbortController for the in-flight runChatLoop. Aborted on Ctrl+C before
  // exit so streamText stops hitting the provider after the Ink app tears
  // down. Cleared in handleSubmit's finally.
  const abortControllerRef = useRef<AbortController | null>(null);
  // Orchestrator instance (Plan 6). Lazily constructed on first
  // onDiffDetected so we don't pay init cost for chats that never emit a
  // diff. The orchestrator runs a full Diff Cycle (worktree → apply →
  // self-heal → merge → commit) per LLM diff response and is the single
  // source of truth for writing to disk — the legacy TUI approval overlay's
  // direct-write path was removed in favor of this pipeline.
  const orchestratorRef = useRef<Orchestrator | null>(null);
  // Live messages array shared between `runChatLoop` and the Orchestrator
  // (Q7/A). Each `handleSubmit` resets the array with the fresh user turn
  // and passes the same reference to both consumers. When the self-heal
  // loop hits an apply/command failure, the orchestrator pushes a synthetic
  // "user" feedback message here; the next `runChatLoop` iteration picks
  // it up naturally and the LLM regenerates the diff.
  const liveMessagesRef = useRef<ModelMessage[]>([]);
  // Intent Declaration: when the agent emits start_workflow(), we capture the
  // workflow name + phase to drive the WorkflowIndicator header. Cleared back
  // to null when the agent returns to Direct Mode.
  const [workflow, setWorkflow] = useState<string | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  // Slash command context. projectRoot is resolved from cwd at render time;
  // userSkillsDir is left empty until config exposes a skills path.
  const slashCtx: SlashContext = {
    projectRoot: process.cwd(),
    userSkillsDir: '',
  };

  useInput((inputChar, key) => {
    if (key.ctrl && inputChar.toLowerCase() === 'c') {
      abortControllerRef.current?.abort();
      exit();
    }
  });

  const handleSubmit = async (userInput: string) => {
    const trimmed = userInput.trim();
    if (trimmed === '') return;
    // Slash commands short-circuit before any LLM call. They run even while a
    // stream is in flight so the user can /smol or /tokens mid-response.
    const slashHandled = await dispatchSlash(trimmed, slashCtx);
    if (slashHandled) {
      setInputKey((k) => k + 1);
      return;
    }
    // Guard against double-submit while streaming. Reads ref (sync) instead of
    // state to avoid the stale-closure trap inside an async event handler.
    if (streamingRef.current) return;
    streamingRef.current = true;
    setIsStreaming(true);
    setInputKey((k) => k + 1);

    setMessages((m) => [...m, { role: 'user', content: trimmed }]);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Seed the live messages array for this turn. runChatLoop and the
    // Orchestrator share this same ref (Q7/A) so the orchestrator's
    // self-heal feedback messages reach the LLM on the next iteration.
    liveMessagesRef.current = [{ role: 'user', content: trimmed }];

    try {
      await runChatLoop(liveMessagesRef.current, {
        config,
        context,
        abortSignal: abortController.signal,
        onToken: (chunk) => {
          setMessages((m) => {
            const last = m[m.length - 1];
            if (last && last.role === 'assistant') {
              return [
                ...m.slice(0, -1),
                { role: 'assistant', content: last.content + chunk },
              ];
            }
            return [...m, { role: 'assistant', content: chunk }];
          });
        },
        onToolCall: (name) => {
          setMessages((m) => [...m, { role: 'tool', content: `call ${name}` }]);
        },
        onDiffDetected: (diff) => {
          // The Orchestrator is the single write path. It parses the diff,
          // prompts for approval via readline, creates a worktree, applies
          // the diff, runs self-heal, merges, commits, and cleans up.
          // Console-only output for v0.1; a future task will surface the
          // phase/approval state in the TUI.
          // Wrapped in a void IIFE because runChatLoop types this callback
          // as (diff: string) => void (sync) — the fire-and-forget async
          // work must not escape as a floating Promise.
          void (async () => {
            try {
              if (!orchestratorRef.current) {
                orchestratorRef.current = new Orchestrator({
                  projectRoot: slashCtx.projectRoot,
                  context,
                  approvalQueue: queueRef.current,
                  taskUuid: randomUUID(),
                  abortSignal: abortController.signal,
                  chatMessages: liveMessagesRef.current,
                  onSelfHealEvent: (e) => {
                    console.log(`[self-heal] ${e.type}`);
                  },
                  onPhaseChange: (p) => {
                    console.log(`[orchestrator] phase: ${p}`);
                  },
                });
            }

              const result = await orchestratorRef.current.handleDiffDetected(diff);
              if (!result.success) {
                console.error(
                  `[orchestrator] Diff cycle failed: ${result.error ?? 'unknown'}`,
                );
              } else {
                console.log(
                  `[orchestrator] Diff cycle succeeded: ${result.mergedFiles.join(', ')}`,
                );
              }
            } catch (err) {
              console.error(`[orchestrator] threw: ${(err as Error).message}`);
            }
          })();
        },
        onIntentDeclared: (intent) => {
          if (intent.type === 'workflow') {
            setWorkflow(intent.name);
            setPhase(null);
          } else {
            // Direct Mode — clear the workflow indicator.
            setWorkflow(null);
            setPhase(null);
          }
        },
      });
    } catch (err) {
      const isAbort =
        err instanceof Error &&
        (err.name === 'AbortError' ||
          (err as { code?: string }).code === 'ABORT_ERR');
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: isAbort ? '[aborted]' : `[error] ${(err as Error).message}`,
        },
      ]);
    } finally {
      streamingRef.current = false;
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  // Auto-submit the argv-provided prompt once on mount. Ref guard defends
  // against StrictMode double-invocation so we never fire the prompt twice.
  useEffect(() => {
    if (!initialPrompt || initialSubmitRef.current) return;
    initialSubmitRef.current = true;
    void handleSubmit(initialPrompt);
    // handleSubmit closes over stable state setters; only initialPrompt
    // matters and it is available at mount. Empty deps are intentional.
  }, []);

  // Normal 2-panel Direct Mode layout: context sidebar + chat/transcript.
  return (
    <Box flexDirection="row" height="100%">
      <Box borderStyle="single" paddingX={1} width="40%">
        <ContextPanel
          entries={context.snapshot()}
          totalTokens={context.totalTokens}
          budget={context.budgetTokens}
        />
      </Box>
      <Box flexDirection="column" paddingX={1} width="60%">
        <ChatView
          messages={messages}
          isStreaming={isStreaming}
          workflowIndicator={
            workflow ? <WorkflowIndicator workflow={workflow} phase={phase} /> : null
          }
        />
        <Box marginTop={1}>
          {!isStreaming && (
            <TextInput
              key={inputKey}
              onSubmit={handleSubmit}
              placeholder="Type your prompt (Ctrl+C to exit)"
            />
          )}
        </Box>
      </Box>
    </Box>
  );
}

export interface ChatCommandOptions {
  /** Override the active provider's `defaultModel` for this session. */
  model?: string;
  /**
   * Switch the active provider by id (must match a key in
   * `providers` from the config file).
   */
  provider?: string;
}

function applyOverrides(
  config: AwecodeConfig,
  opts: ChatCommandOptions,
): AwecodeConfig {
  if (!opts.model && !opts.provider) return config;
  const activeProvider = opts.provider ?? config.activeProvider;
  const providerConfig = config.providers[activeProvider];
  if (!providerConfig) {
    throw new Error(
      `Provider "${activeProvider}" not found in config. ` +
        `Available: ${Object.keys(config.providers).join(', ')}`,
    );
  }
  return {
    activeProvider,
    providers: {
      ...config.providers,
      [activeProvider]: opts.model
        ? { ...providerConfig, defaultModel: opts.model }
        : providerConfig,
    },
  };
}

export async function chatCommand(
  initialPrompt?: string,
  opts: ChatCommandOptions = {},
): Promise<void> {
  const configPath = process.env.AWECODE_CONFIG_PATH ?? getDefaultConfigPath();
  const loaded = await loadConfig(configPath);

  if (!loaded) {
    console.error(`No config found at ${configPath}. Run 'awecode config' first.`);
    process.exit(1);
  }

  let config: AwecodeConfig;
  try {
    config = applyOverrides(loaded, opts);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  if (opts.model) {
    console.log(`[awecode] using model override: ${opts.model}`);
  }
  if (opts.provider) {
    console.log(`[awecode] using provider override: ${opts.provider}`);
  }

  const context = new ContextManager();

  // Register slash commands (idempotent — registerSlashCommand replaces any
  // existing entry with the same name). Safe to call on every chat startup.
  registerWorkflowSlashCommands();
  registerCompactionSlashCommands();

  render(<ChatApp context={context} config={config} initialPrompt={initialPrompt} />);
}
