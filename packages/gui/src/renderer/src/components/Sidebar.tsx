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

import { useState, type ReactNode } from 'react';
import type { SessionMeta } from '../../../shared/protocol.js';

interface Props {
  sessions: SessionMeta[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  /** Optional header element rendered above the session list. Desktop passes workspace UI. */
  header?: ReactNode;
}

/**
 * Shared sidebar layout. Both Desktop (via WorkspaceSidebar wrapper) and
 * Web (via SidebarDrawer) reuse this. Owns rename/delete UI state but NOT
 * data fetching — caller provides `sessions` via the useSessions hook.
 */
export function Sidebar({ sessions, activeId, onSelect, onNew, onDelete, onRename, header }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');

  function startRename(s: SessionMeta): void {
    setEditingId(s.id);
    setDraftTitle(s.title);
  }

  function commitRename(): void {
    if (editingId) {
      const t = draftTitle.trim();
      if (t) onRename(editingId, t);
    }
    setEditingId(null);
  }

  return (
    <aside className="sidebar">
      {header}
      <div className="sidebar-header">
        <button className="btn-new" onClick={onNew} title="New chat">
          <span className="plus">+</span>
          <span>New chat</span>
        </button>
      </div>
      <div className="sidebar-list">
        {sessions.length === 0 ? (
          <div className="sidebar-empty">No conversations yet</div>
        ) : (
          <div className="session-group">
            {sessions.map((s) => (
              <div
                key={s.id}
                className={`session-row ${activeId === s.id ? 'active' : ''}`}
                onClick={() => editingId !== s.id && onSelect(s.id)}
              >
                {editingId === s.id ? (
                  <input
                    className="rename-input"
                    autoFocus
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <span
                      className="session-title"
                      title={s.title}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        startRename(s);
                      }}
                    >
                      {s.title}
                    </span>
                    <button
                      className="btn-delete"
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete "${s.title}"?`)) onDelete(s.id);
                      }}
                    >
                      ×
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
