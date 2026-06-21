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

import { contextBridge, ipcRenderer } from 'electron';
import type {
  GuiAgentEvent,
  GuiClientCommand,
  Session,
  SessionMeta,
  WorkspaceState,
} from '../shared/protocol.js';

const api = {
  send: (cmd: GuiClientCommand): Promise<void> =>
    ipcRenderer.invoke('agent:send', cmd),
  onEvent: (cb: (ev: GuiAgentEvent) => void): (() => void) => {
    const handler = (_e: unknown, ev: GuiAgentEvent): void => cb(ev);
    ipcRenderer.on('agent:event', handler);
    return () => {
      ipcRenderer.off('agent:event', handler);
    };
  },
  onSessionLoaded: (
    cb: (payload: { session: SessionMeta; messages: Session['messages'] }) => void,
  ): (() => void) => {
    const handler = (
      _e: unknown,
      payload: { session: SessionMeta; messages: Session['messages'] },
    ): void => cb(payload);
    ipcRenderer.on('session:loaded', handler);
    return () => {
      ipcRenderer.off('session:loaded', handler);
    };
  },
  listSessions: (): Promise<SessionMeta[]> => ipcRenderer.invoke('session:list'),
  newSession: (): Promise<SessionMeta | null> => ipcRenderer.invoke('session:new'),
  openSession: (id: string): Promise<SessionMeta | null> =>
    ipcRenderer.invoke('session:open', id),
  deleteSession: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('session:delete', id),
  renameSession: (id: string, title: string): Promise<SessionMeta | null> =>
    ipcRenderer.invoke('session:rename', id, title),
  currentSession: (): Promise<SessionMeta | null> =>
    ipcRenderer.invoke('session:current'),

  // --- Workspace (project picker) ---
  workspaceState: (): Promise<WorkspaceState> =>
    ipcRenderer.invoke('workspace:state'),
  workspaceCurrent: (): Promise<string> => ipcRenderer.invoke('workspace:current'),
  workspacePick: (): Promise<string | null> => ipcRenderer.invoke('workspace:pick'),
  workspaceOpen: (cwd: string): Promise<WorkspaceState> =>
    ipcRenderer.invoke('workspace:open', cwd),
  workspaceForget: (cwd: string): Promise<WorkspaceState> =>
    ipcRenderer.invoke('workspace:forget', cwd),
};

contextBridge.exposeInMainWorld('awecode', api);

export type AwecodeApi = typeof api;
