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
import { parseDiff, applyDiff } from '@awecode/diff';
import {
  ContextManager,
  ApprovalQueue,
  runChatLoop,
  type ApprovalRequest,
  type ApprovalDecision,
} from '@awecode/agent';
import { Orchestrator } from '@awecode/orchestrator';
import type { ModelMessage } from 'ai';
import { ChatView, type ChatMessage } from '../components/ChatView.js';
import { ContextPanel } from '../components/ContextPanel.js';
import { ApprovalView } from '../components/ApprovalView.js';
import { WorkflowIndicator } from '../components/WorkflowIndicator.js';
import { dispatchSlash, type SlashContext } from '../slash/index.js';
import { registerWorkflowSlashCommands } from '../slash/workflow.js';
import { registerCompactionSlashCommands } from '../slash/compaction.js';
import { readFile, writeFile } from 'node:fs/promises';

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
  // Use a ref-backed ApprovalQueue so async callbacks (onDiffDetected) mutate the
  // same instance the render loop reads. State-stored class instances don't
  // trigger re-renders on method calls, and a fresh instance per render would
  // drop enqueued diffs.
  const queueRef = useRef<ApprovalQueue>(new ApprovalQueue());
  const [currentApproval, setCurrentApproval] = useState<ApprovalRequest | null>(null);
  const [currentBlockIdx, setCurrentBlockIdx] = useState(0);
  // isStreaming lives in state for rendering, but handleSubmit's early-return
  // guard must read the freshest value to prevent double-submits racing the
  // setState flush. ref mirrors state for synchronous reads inside async paths.
  const streamingRef = useRef(false);
  // Tracks whether an approval overlay is already open so onDiffDetected
  // doesn't fight the post-stream pumpApproval.
  const approvalOpenRef = useRef(false);
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
  // self-heal → merge → commit) alongside the legacy TUI approval flow —
  // unification is post-v0.1.
  const orchestratorRef = useRef<Orchestrator | null>(null);
  // Backing array for the orchestrator's chatMessages option. The self-heal
  // loop pushes feedback messages here on apply/test failures; a future task
  // will thread this into runChatLoop's message history (Plan 6 wires the
  // orchestrator side only).
  const orchestratorMessagesRef = useRef<ModelMessage[]>([]);
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

  // Promote the next queued diff (if any) into the approval overlay.
  const pumpApproval = () => {
    if (approvalOpenRef.current) return;
    const next = queueRef.current.dequeue();
    if (next) {
      approvalOpenRef.current = true;
      setCurrentBlockIdx(0);
      setCurrentApproval(next);
    }
  };

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

    try {
      await runChatLoop([{ role: 'user', content: trimmed }], {
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
          // Existing TUI path (preserved for v0.1 backward compat):
          // ApprovalQueue + ApprovalView still drive the interactive overlay.
          const parsed = parseDiff(diff);
          for (const p of parsed) {
            queueRef.current.enqueue(p);
          }

          // New orchestrator path (Plan 6): run a full Diff Cycle in
          // parallel. Console-only output for v0.1; TUI rendering is Plan
          // 5b scope. Wrapped in a void IIFE because runChatLoop types
          // this callback as (diff: string) => void (sync) — the fire-and-
          // forget async work must not escape as a Promise.
          void (async () => {
            try {
              if (!orchestratorRef.current) {
                orchestratorRef.current = new Orchestrator({
                  projectRoot: slashCtx.projectRoot,
                  context,
                  approvalQueue: queueRef.current,
                  taskUuid: randomUUID(),
                  abortSignal: abortController.signal,
                  chatMessages: orchestratorMessagesRef.current,
                  onSelfHealEvent: (e) => {
                    console.log(`[self-heal] ${e.type}`);
                  },
                  onPhaseChange: (p) => {
                    console.log(`[orchestrator] phase: ${p}`);
                  },
                  onApprovalDecision: (d) => {
                    console.log(`[approval] ${d}`);
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
      // After the stream completes, surface any pending diffs.
      pumpApproval();
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

  const handleApproval = async (decision: ApprovalDecision) => {
    if (!currentApproval) return;
    const block = currentApproval.parsedDiff.blocks[currentBlockIdx];
    if (!block) return;

    if (decision === 'accept') {
      try {
        const source = await readFile(currentApproval.filePath, 'utf-8');
        const applyResult = applyDiff(source, [block]);
        if (applyResult.ok) {
          await writeFile(currentApproval.filePath, applyResult.result, 'utf-8');
          context.refreshFile(currentApproval.filePath, applyResult.result);
        } else {
          // Surface apply failure to the chat log so the user knows why their
          // accepted diff didn't land.
          setMessages((m) => [
            ...m,
            {
              role: 'tool',
              content: `apply failed (${applyResult.error}) on ${currentApproval.filePath}`,
            },
          ]);
        }
      } catch (err) {
        setMessages((m) => [
          ...m,
          {
            role: 'tool',
            content: `apply threw: ${(err as Error).message}`,
          },
        ]);
      }
    }

    // Advance to the next block within this diff, else the next queued diff,
    // else close the overlay.
    const nextIdx = currentBlockIdx + 1;
    if (nextIdx < currentApproval.parsedDiff.blocks.length) {
      setCurrentBlockIdx(nextIdx);
      return;
    }
    const next = queueRef.current.dequeue();
    if (next) {
      setCurrentBlockIdx(0);
      setCurrentApproval(next);
    } else {
      approvalOpenRef.current = false;
      setCurrentApproval(null);
      setCurrentBlockIdx(0);
    }
  };

  // Approval Mode overlay takes over rendering while a diff is pending.
  if (currentApproval) {
    return (
      <ApprovalView
        request={currentApproval}
        blockIndex={currentBlockIdx}
        onDecision={handleApproval}
      />
    );
  }

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

export async function chatCommand(initialPrompt?: string): Promise<void> {
  const configPath = process.env.AWECODE_CONFIG_PATH ?? getDefaultConfigPath();
  const config = await loadConfig(configPath);

  if (!config) {
    console.error(`No config found at ${configPath}. Run 'awecode config' first.`);
    process.exit(1);
  }

  const context = new ContextManager();

  // Register slash commands (idempotent — registerSlashCommand replaces any
  // existing entry with the same name). Safe to call on every chat startup.
  registerWorkflowSlashCommands();
  registerCompactionSlashCommands();

  render(<ChatApp context={context} config={config} initialPrompt={initialPrompt} />);
}
