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

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { applyEvent, resumeFromMessages } from '@awecode/agent';
import type { ModelMessage } from 'ai';
import type { GuiAgentEvent, GuiClientCommand } from '../shared/protocol.js';
import {
  type Session,
  type SessionMeta,
  DEFAULT_TITLE,
  deleteSession as storeDeleteSession,
  listSessionsInWorkspace,
  loadSession,
  renameSession as storeRenameSession,
  saveSession,
} from './sessions.js';
import {
  forgetWorkspace,
  loadWorkspaceState,
  setCurrentWorkspace,
  type WorkspaceState,
} from './workspaces.js';
import { migrateSessionsDir } from './migration.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Locate the awecode CLI JavaScript entry (built with tsup).
 *
 * The CLI ships as plain Node ESM — Electron cannot run it directly because
 * `process.execPath` inside Electron points at the Electron binary, not node.
 * So we spawn it via an explicit `node` executable. To find node we look at
 * `process.env.NODE` first, then fall back to the node that produced the
 * current `process.versions.node` (electrons usually ship a real node next
 * to the electron binary for forks). If all else fails we shell out via
 * `npx awecode`-style PATH lookup.
 *
 * `AWECODE_CLI_BIN` lets users point at a dev CLI build, useful for testing
 * changes without reinstalling.
 */
interface CliLaunch {
  /** Node binary to run the CLI with. */
  node: string;
  /** Absolute path to the CLI's dist/index.js entry. */
  cliEntry: string;
}

function resolveCliLaunch(): CliLaunch {
  const envBin = process.env.AWECODE_CLI_BIN;
  const envNode = process.env.NODE;

  // Built artifact: packages/gui/out/main -> up 3 levels = packages/
  const here = __dirname;
  const candidateEntries = envBin
    ? [envBin]
    : [
        resolve(here, '../../../cli/dist/index.js'), // packages/gui/out/main -> packages/cli/dist
        resolve(here, '../../cli/dist/index.js'), // when running from src via electron-vite dev
        resolve(process.cwd(), 'packages/cli/dist/index.js'),
      ];

  let cliEntry = '';
  for (const c of candidateEntries) {
    if (existsSync(c)) {
      cliEntry = c;
      break;
    }
  }
  if (!cliEntry) {
    throw new Error(
      `Cannot find awecode CLI build. Tried:\n  ${candidateEntries.join('\n  ')}\n` +
        `Run "yarn workspace @awecode/cli build" or set AWECODE_CLI_BIN.`,
    );
  }

  // Resolve node. Electron's process.execPath is the Electron binary; we need
  // real node. The Electron distribution bundles node at a known relative path
  // (resources/node on macOS, sibling on Win/Linux), but that's fragile — so
  // prefer an explicit NODE env var, else the user's PATH.
  let node: string;
  if (envNode && existsSync(envNode)) {
    node = envNode;
  } else {
    // Fallback: rely on PATH. On Windows use the .exe extension when missing.
    node = process.platform === 'win32' ? 'node.exe' : 'node';
  }

  return { node, cliEntry };
}

class AgentBridge {
  private child: ChildProcessWithoutNullStreams | null = null;
  private win: BrowserWindow | null = null;
  /**
   * The session currently bound to this bridge. The bridge writes every
   * agent/user/tool message into `session.messages` and re-saves the JSON
   * file. The id is stable across the bridge's lifetime and is what the
   * renderer uses to address the session.
   */
  private session: Session | null = null;
  /**
   * Messages to push into the child agent process once it's ready.
   * Populated by switchTo() when reopening a session; cleared after the
   * resume command is written to stdin.
   */
  private pendingResume: ModelMessage[] | null = null;
  /**
   * Workspace the agent currently operates in. Read from the workspace
   * store at startup, mutated when the user picks a different folder.
   * Drives the child process's cwd.
   */
  private cwd: string;

  constructor(initialCwd: string) {
    this.cwd = initialCwd;
  }

  attach(win: BrowserWindow): void {
    this.win = win;
  }

  get currentSession(): Session | null {
    return this.session;
  }

  get currentCwd(): string {
    return this.cwd;
  }

  /**
   * Switch to a different workspace: kill the running agent child, reset
   * the session, then start fresh inside `newCwd`. The renderer will see a
   * `session:loaded` event so it can reset its transcript + sidebar.
   */
  switchWorkspace(newCwd: string): void {
    this.cwd = newCwd;
    this.pendingResume = null;
    this.dispose();
    this.session = null;
    this.start();
  }

  /** Spin up the agent child. Uses the existing session if set, else creates one. */
  start(): void {
    if (this.child) return;
    const { node, cliEntry } = resolveCliLaunch();
    const cwd = this.cwd;
    this.child = spawn(node, [cliEntry, 'open', 'gui', '--internal'], {
      cwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (!this.session) {
      this.session = {
        id: randomUUID(),
        title: DEFAULT_TITLE,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        cwd,
        messages: [],
      };
      saveSession(this.session);
    }

    const rl = createInterface({ input: this.child.stdout });
    rl.on('line', (line) => {
      if (!line.trim()) return;
      try {
        const ev = JSON.parse(line) as GuiAgentEvent;
        this.handle(ev);
        this.win?.webContents.send('agent:event', ev);
      } catch {
        this.win?.webContents.send('agent:event', {
          type: 'error',
          message: `non-JSON stdout: ${line}`,
        } satisfies GuiAgentEvent);
      }
    });

    const errRl = createInterface({ input: this.child.stderr });
    errRl.on('line', (line) => {
      this.win?.webContents.send('agent:event', {
        type: 'error',
        message: line,
      } satisfies GuiAgentEvent);
    });

    this.child.on('exit', (code) => {
      this.win?.webContents.send('agent:event', { type: 'done' });
      if (code !== 0 && code !== null) {
        this.win?.webContents.send('agent:event', {
          type: 'error',
          message: `agent exited with code ${code}`,
        });
      }
    });

    // Tell the renderer which session it's bound to so it can reset its
    // transcript and show the right title.
    this.emitSessionLoaded();

    // If we're resuming a persisted session, push its transcript into the
    // fresh child via the 'resume' protocol command. The child's
    // ProtocolSession seeds its liveMessages so the next prompt sees the
    // full prior context.
    if (this.pendingResume && this.pendingResume.length > 0) {
      const cmd: GuiClientCommand = { type: 'resume', messages: this.pendingResume };
      this.child?.stdin.write(JSON.stringify(cmd) + '\n');
      this.pendingResume = null;
    }
  }

  /**
   * Fold an event into the bound session and persist. Delegates to the
   * shared pure function so Desktop and Web share identical semantics.
   * See ADR-0007.
   */
  private handle(ev: GuiAgentEvent): void {
    if (!this.session) return;
    applyEvent(this.session, ev);
    saveSession(this.session);
  }

  /**
   * Restart the child process bound to a different session. Returns the
   * session metadata so the renderer can update its sidebar + re-render the
   * transcript from the persisted messages.
   */
  switchTo(sessionId: string): SessionMeta | null {
    const loaded = loadSession(sessionId);
    if (!loaded) return null;
    this.dispose();
    this.session = loaded;
    // Transform the persisted transcript into ModelMessage[] for the
    // fresh child process. Stored on pendingResume and flushed in start()
    // once the new child's stdin is alive.
    this.pendingResume = resumeFromMessages(loaded.messages);
    this.start();
    return stripMessages(loaded);
  }

  /** Start a brand new session (sidebar "New chat" button). */
  newSession(): void {
    this.pendingResume = null;
    this.dispose();
    this.session = null;
    this.start();
  }

  /** Emit a synthetic "session:loaded" event so the renderer resets. */
  emitSessionLoaded(): void {
    if (!this.session) return;
    this.win?.webContents.send('session:loaded', {
      session: stripMessages(this.session),
      messages: this.session.messages,
    });
  }

  send(cmd: GuiClientCommand): void {
    if (!this.child || this.child.killed) {
      this.win?.webContents.send('agent:event', {
        type: 'error',
        message: 'agent process not running',
      });
      return;
    }
    this.child.stdin.write(JSON.stringify(cmd) + '\n');
  }

  dispose(): void {
    try {
      this.child?.stdin.end();
    } catch {
      /* ignore */
    }
    this.child?.kill('SIGTERM');
    this.child = null;
  }
}

function stripMessages(s: Session): SessionMeta {
  const { messages: _m, ...meta } = s;
  void _m;
  return meta as SessionMeta;
}

// Resolve the initial workspace. Preference order:
//   1. Persisted "current" from ~/.awecode/workspaces.json
//   2. AWECODE_GUI_CWD env (set by the CLI wrapper)
//   3. process.cwd() (last resort — usually the workspace awecode was
//      launched from, but only meaningful in dev)
function resolveInitialCwd(): string {
  const persisted = loadWorkspaceState().current;
  if (persisted && existsSync(persisted)) return persisted;
  if (process.env.AWECODE_GUI_CWD && existsSync(process.env.AWECODE_GUI_CWD)) {
    return process.env.AWECODE_GUI_CWD;
  }
  return process.cwd();
}

const bridge = new AgentBridge(resolveInitialCwd());

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    title: 'awecode',
    backgroundColor: '#0b0d10',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: resolve(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Dev mode served by Vite; prod loads built renderer.
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(resolve(__dirname, '../renderer/index.html'));

  bridge.attach(win);
  bridge.start();
  return win;
}

app.whenReady().then(() => {
  // Run one-shot session migration before any session is loaded.
  migrateSessionsDir();

  ipcMain.handle('agent:send', (_e, cmd: GuiClientCommand) => {
    bridge.send(cmd);
  });

  ipcMain.handle('session:list', () => listSessionsInWorkspace(bridge.currentCwd));
  ipcMain.handle('session:new', () => {
    bridge.newSession();
    return bridge.currentSession ? stripMessages(bridge.currentSession) : null;
  });
  ipcMain.handle('session:open', (_e, id: string) => bridge.switchTo(id));
  ipcMain.handle('session:delete', (_e, id: string) => {
    storeDeleteSession(id);
    return true;
  });
  ipcMain.handle('session:rename', (_e, id: string, title: string) =>
    storeRenameSession(id, title),
  );
  ipcMain.handle('session:current', () =>
    bridge.currentSession ? stripMessages(bridge.currentSession) : null,
  );

  // --- Workspace -----------------------------------------------------------
  ipcMain.handle('workspace:state', (): WorkspaceState => loadWorkspaceState());
  ipcMain.handle('workspace:current', (): string => bridge.currentCwd);
  ipcMain.handle('workspace:pick', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Open project folder',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0]!;
  });
  ipcMain.handle('workspace:open', (_e, cwd: string): WorkspaceState => {
    const state = setCurrentWorkspace(cwd);
    bridge.switchWorkspace(cwd);
    return state;
  });
  ipcMain.handle('workspace:forget', (_e, cwd: string): WorkspaceState =>
    forgetWorkspace(cwd),
  );

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  createWindow();
});

app.on('window-all-closed', () => {
  bridge.dispose();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  bridge.dispose();
});
