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

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  loadConfig,
  getDefaultConfigPath,
  resolveProviderContextWindow,
  type AwecodeConfig,
} from '@awecode/llm';
import {
  ContextManager,
  ApprovalQueue,
  runChatLoop,
} from '@awecode/agent';
import { Orchestrator } from '@awecode/orchestrator';
import type { ModelMessage } from 'ai';
import type {
  GuiAgentEvent,
  GuiClientCommand,
  ContextEntrySnapshot,
} from '@awecode/gui/shared/protocol';

/**
 * `awecode open gui` launches the Electron desktop app.
 *
 * Two modes:
 *   - Default: spawn the Electron entry from @awecode/gui (built artifact).
 *     Falls back to a helpful error if the GUI package has not been built.
 *   - `--internal`: run the headless NDJSON protocol server that the Electron
 *     main process spawns as its child. Emits `GuiAgentEvent` lines on stdout
 *     and reads `GuiClientCommand` lines on stdin. This mode is normally only
 *     invoked by the Electron main process itself, but is kept inside the CLI
 *     so the agent code path is identical between terminal and GUI sessions.
 */
export async function openGuiCommand(args: string[]): Promise<void> {
  if (args.includes('--internal')) {
    await runInternalProtocolServer();
    return;
  }
  await launchElectronApp();
}

// ---------------------------------------------------------------------------
// Default mode: launch Electron
// ---------------------------------------------------------------------------

async function launchElectronApp(): Promise<void> {
  const guiMain = resolveGuiMain();
  const { cmd, args, useShell } = resolveElectron();
  const child = spawn(cmd, [...args, guiMain], {
    stdio: 'inherit',
    shell: useShell,
    env: {
      ...process.env,
      AWECODE_GUI_CWD: process.cwd(),
    },
  });
  // Without an 'error' handler a failed spawn crashes the Node process
  // with an unhandledEvent. Surface the real cause instead.
  child.on('error', (err) => {
    console.error(
      `[awecode] failed to launch Electron: ${(err as Error).message}\n` +
        `Tried: ${cmd} ${args.join(' ')}\n` +
        `Set ELECTRON_PATH to point at an electron executable.`,
    );
    process.exit(1);
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

/**
 * Resolve the Electron executable.
 *
 * The CLI may be invoked from anywhere (it is `npm link`-ed globally), so we
 * cannot rely on `node_modules/.bin` being on PATH. Strategy:
 *   1. ELECTRON_PATH env var (highest priority, overrides everything)
 *   2. The bundled electron binary at `node_modules/electron/dist/electron(.exe)`
 *      — located relative to the awecode workspace root.
 *   3. The `.bin/electron(.CMD)` shim from the workspace.
 *   4. Bare `electron` on PATH (last resort; works only if user installed it).
 *
 * Returns the spawn triple: command, args prefix, and whether `shell: true`
 * is required (.CMD/.bat shims on Windows need a shell to spawn).
 */
function resolveElectron(): { cmd: string; args: string[]; useShell: boolean } {
  const envPath = process.env.ELECTRON_PATH;
  if (envPath && existsSync(envPath)) {
    return {
      cmd: envPath,
      args: [],
      useShell: needsShellWin(envPath),
    };
  }

  const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const candidates: Array<{ exe: string; useShell: boolean }> = [];
  if (process.platform === 'win32') {
    candidates.push(
      { exe: resolve(workspaceRoot, 'node_modules/electron/dist/electron.exe'), useShell: false },
      { exe: resolve(workspaceRoot, 'node_modules/.bin/electron.CMD'), useShell: true },
    );
  } else {
    candidates.push(
      { exe: resolve(workspaceRoot, 'node_modules/electron/dist/electron'), useShell: false },
      { exe: resolve(workspaceRoot, 'node_modules/.bin/electron'), useShell: false },
    );
  }

  for (const c of candidates) {
    if (existsSync(c.exe)) {
      return { cmd: c.exe, args: [], useShell: c.useShell };
    }
  }

  // Last resort: hope electron is on PATH.
  console.error(
    `[awecode] electron not found in workspace. Falling back to PATH lookup.\n` +
      `Set ELECTRON_PATH to point at an electron binary if this fails.`,
  );
  return { cmd: 'electron', args: [], useShell: false };
}

function needsShellWin(bin: string): boolean {
  return process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin);
}

function resolveGuiMain(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // Built CLI: packages/cli/dist/commands/gui.js → ../../../gui/out/main
  // (dist/commands → dist → cli → packages → packages/gui/out/main).
  // Dev (tsup --watch): same layout, same resolution.
  const candidates = [
    resolve(here, '../../../gui/out/main/index.js'),
    resolve(here, '../../gui/out/main/index.js'),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    throw new Error(
      `Cannot find Electron entry. Tried:\n  ${candidates.join('\n  ')}\n` +
        `Run "yarn workspace @awecode/gui build".`,
    );
  }
  return found;
}

// ---------------------------------------------------------------------------
// Internal mode: NDJSON protocol server
// ---------------------------------------------------------------------------

function writeEvent(ev: GuiAgentEvent): void {
  process.stdout.write(JSON.stringify(ev) + '\n');
}

function snapshotContext(ctx: ContextManager): {
  entries: ContextEntrySnapshot[];
  totalTokens: number;
  budgetTokens: number;
} {
  const entries = ctx.snapshot().map((e) => ({
    type: e.type,
    label:
      e.path ??
      (e.lines ? `${e.type}:${e.lines.start}-${e.lines.end}` : e.type),
    tokens: e.tokens,
  }));
  return {
    entries,
    totalTokens: ctx.totalTokens,
    budgetTokens: ctx.budgetTokens,
  };
}

async function runInternalProtocolServer(): Promise<void> {
  const configPath = process.env.AWECODE_CONFIG_PATH ?? getDefaultConfigPath();
  const loaded = await loadConfig(configPath);
  if (!loaded) {
    writeEvent({
      type: 'error',
      message: `No config found at ${configPath}. Run 'awecode config' first.`,
    });
    writeEvent({ type: 'done' });
    return;
  }
  const config: AwecodeConfig = loaded;
  const activeProviderCfg = config.providers[config.activeProvider];
  const context =
    activeProviderCfg !== undefined
      ? new ContextManager(resolveProviderContextWindow(activeProviderCfg))
      : new ContextManager();
  const queueRef = { current: new ApprovalQueue() };
  const liveMessagesRef = { current: [] as ModelMessage[] };
  let orchestrator: Orchestrator | null = null;
  let abortController: AbortController | null = null;

  const activeModel =
    config.providers[config.activeProvider]?.defaultModel;

  writeEvent({
    type: 'ready',
    cwd: process.cwd(),
    model: activeModel,
    provider: config.activeProvider,
  });
  const snap0 = snapshotContext(context);
  writeEvent({ type: 'context_snapshot', ...snap0 });

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

  rl.on('line', (line) => {
    if (!line.trim()) return;
    let cmd: GuiClientCommand;
    try {
      cmd = JSON.parse(line) as GuiClientCommand;
    } catch {
      writeEvent({ type: 'error', message: 'invalid JSON on stdin' });
      return;
    }
    if (cmd.type === 'exit') {
      abortController?.abort();
      writeEvent({ type: 'done' });
      process.exit(0);
      return;
    }
    if (cmd.type === 'abort') {
      abortController?.abort();
      return;
    }
    if (cmd.type === 'prompt') {
      void handlePrompt(cmd.text);
    }
  });

  async function handlePrompt(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;
    writeEvent({ type: 'message', role: 'user', content: trimmed });

    liveMessagesRef.current = [{ role: 'user', content: trimmed }];
    abortController = new AbortController();

    try {
      await runChatLoop(liveMessagesRef.current, {
        config,
        context,
        abortSignal: abortController.signal,
        onToken: (chunk) => writeEvent({ type: 'token', chunk }),
        onToolCall: (name) => writeEvent({ type: 'tool_call', name }),
        onDiffDetected: (diff) => {
          void (async () => {
            try {
              if (!orchestrator) {
                orchestrator = new Orchestrator({
                  projectRoot: process.cwd(),
                  context,
                  approvalQueue: queueRef.current,
                  taskUuid: randomUUID(),
                  abortSignal: abortController!.signal,
                  chatMessages: liveMessagesRef.current,
                });
              }
              const result = await orchestrator.handleDiffDetected(diff);
              writeEvent({
                type: 'message',
                role: 'tool',
                content: result.success
                  ? `applied: ${result.mergedFiles.join(', ')}`
                  : `failed: ${result.error ?? 'unknown'}`,
              });
              const snap = snapshotContext(context);
              writeEvent({ type: 'context_snapshot', ...snap });
            } catch (err) {
              writeEvent({
                type: 'error',
                message: `[orchestrator] ${(err as Error).message}`,
              });
            }
          })();
        },
        onIntentDeclared: (intent) => {
          if (intent.type === 'workflow') {
            writeEvent({
              type: 'intent',
              intent: 'workflow',
              name: intent.name,
            });
          } else {
            writeEvent({ type: 'intent', intent: 'direct', name: null });
          }
        },
      });
    } catch (err) {
      const isAbort =
        err instanceof Error &&
        (err.name === 'AbortError' ||
          (err as { code?: string }).code === 'ABORT_ERR');
      writeEvent({
        type: 'message',
        role: 'assistant',
        content: isAbort ? '[aborted]' : `[error] ${(err as Error).message}`,
      });
    } finally {
      abortController = null;
      const snap = snapshotContext(context);
      writeEvent({ type: 'context_snapshot', ...snap });
      writeEvent({ type: 'done' });
    }
  }
}
