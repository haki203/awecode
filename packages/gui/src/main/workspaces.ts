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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/**
 * Workspace (project) store for the GUI.
 *
 * Mirrors the Cursor model: the user opens a folder and the agent operates
 * inside that folder. We persist the active workspace + a small recent list
 * under `~/.awecode/workspaces.json` so the app reopens where the user left
 * off, and the sidebar can render a project picker.
 *
 * Sessions themselves are *also* tagged with `cwd`, so given a workspace we
 * can filter its conversation history on the fly (see sessions.ts).
 */

const WORKSPACES_FILE = resolve(
  process.env.AWECODE_WORKSPACES_FILE ??
    join(homedir(), '.awecode', 'workspaces.json'),
);

export interface WorkspaceState {
  /** Absolute path of the currently-open project folder. */
  current: string | null;
  /** Recently-opened folders, most-recent first. */
  recent: string[];
}

const DEFAULT: WorkspaceState = { current: null, recent: [] };

function ensureFile(): void {
  if (!existsSync(WORKSPACES_FILE)) {
    mkdirSync(dirname(WORKSPACES_FILE), { recursive: true });
    writeFileSync(WORKSPACES_FILE, JSON.stringify(DEFAULT, null, 2));
  }
}

export function loadWorkspaceState(): WorkspaceState {
  try {
    ensureFile();
    const raw = readFileSync(WORKSPACES_FILE, 'utf8');
    const parsed = JSON.parse(raw) as WorkspaceState;
    return {
      current: parsed.current ?? null,
      recent: Array.isArray(parsed.recent) ? parsed.recent : [],
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveWorkspaceState(state: WorkspaceState): void {
  ensureFile();
  writeFileSync(WORKSPACES_FILE, JSON.stringify(state, null, 2));
}

/**
 * Set the current workspace and bump it to the top of the recent list.
 * Returns the new state. No-op if the path doesn't exist on disk.
 */
export function setCurrentWorkspace(
  cwd: string,
): WorkspaceState {
  if (!existsSync(cwd)) {
    throw new Error(`Workspace does not exist: ${cwd}`);
  }
  const state = loadWorkspaceState();
  const recent = [cwd, ...state.recent.filter((p) => p !== cwd)].slice(0, 20);
  const next: WorkspaceState = { current: cwd, recent };
  saveWorkspaceState(next);
  return next;
}

export function forgetWorkspace(cwd: string): WorkspaceState {
  const state = loadWorkspaceState();
  const recent = state.recent.filter((p) => p !== cwd);
  const current = state.current === cwd ? null : state.current;
  const next: WorkspaceState = { current, recent };
  saveWorkspaceState(next);
  return next;
}
