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

import { useMemo } from 'react';
import { Sidebar } from './Sidebar.js';
import { useSessions } from '../hooks/useSessions.js';
import { useWorkspace } from '../hooks/useWorkspace.js';
import { useTransport } from '../transport/context.js';

interface Props {
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
}

/**
 * Desktop-only Sidebar wrapper that adds multi-project state (open project,
 * switch workspace, recent projects list) on top of the shared Sidebar.
 *
 * Web does NOT use this — it renders Sidebar directly inside SidebarDrawer.
 *
 * Wires the shared `useSessions` hook (via TransportContext) for the session
 * list, and the Desktop-only `useWorkspace` hook for project state. Selecting
 * or creating a session bubbles up to the parent so it can reset the agent
 * and track the active id — mirroring the pre-refactor App behavior.
 */
export function WorkspaceSidebar({ activeSessionId, onSelectSession, onNewSession }: Props) {
  const transport = useTransport();
  const sessions = useSessions(transport);
  const workspace = useWorkspace();

  const currentName = useMemo(() => basename(workspace.currentCwd), [workspace.currentCwd]);
  const otherRecent = useMemo(
    () => workspace.state.recent.filter((p) => p !== workspace.currentCwd),
    [workspace.state.recent, workspace.currentCwd],
  );

  const header = (
    <>
      <div className="sidebar-header">
        <button
          className="btn-open-project"
          onClick={() => void workspace.pickWorkspace()}
          title="Open a different project folder"
        >
          <span className="icon">📁</span>
          <span>Open project</span>
        </button>
        <div
          className="current-project"
          title={workspace.currentCwd}
          onClick={() => void workspace.switchWorkspace(workspace.currentCwd)}
        >
          <span className="dot" />
          <span className="name">{currentName}</span>
        </div>
      </div>
      {otherRecent.length > 0 && (
        <div className="recent-projects">
          <div className="group-heading">Recent projects</div>
          {otherRecent.map((p) => (
            <div
              key={p}
              className="project-row"
              title={p}
              onClick={() => void workspace.switchWorkspace(p)}
            >
              <span className="icon">📁</span>
              <span className="name">{basename(p)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );

  return (
    <Sidebar
      sessions={sessions.list}
      activeId={activeSessionId}
      header={header}
      onSelect={(id) => {
        void sessions.open(id);
        onSelectSession(id);
      }}
      onNew={onNewSession}
      onDelete={(id) => void sessions.remove(id)}
      onRename={(id, title) => void sessions.rename(id, title)}
    />
  );
}

function basename(p: string): string {
  if (!p) return 'untitled';
  const clean = p.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = clean.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? p;
}
