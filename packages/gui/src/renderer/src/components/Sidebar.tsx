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

  const groups = groupByDate(sessions);

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
          groups.map((g) => (
            <div className="session-group" key={g.label}>
              <div className="group-heading">{g.label}</div>
              {g.items.map((s) => (
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
          ))
        )}
      </div>
    </aside>
  );
}

/**
 * Bucket sessions by relative date of their `updatedAt` timestamp.
 * Groups: Today, Yesterday, This week, Older. Empty buckets are dropped.
 * Caller is expected to pre-sort by updatedAt desc; we preserve that order
 * within each bucket.
 */
function groupByDate(sessions: SessionMeta[]): { label: string; items: SessionMeta[] }[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const startOfWeek = startOfToday - 6 * 86_400_000;

  const buckets: Record<string, SessionMeta[]> = {
    Today: [],
    Yesterday: [],
    'This week': [],
    Older: [],
  };

  for (const s of sessions) {
    if (s.updatedAt >= startOfToday) buckets.Today!.push(s);
    else if (s.updatedAt >= startOfYesterday) buckets.Yesterday!.push(s);
    else if (s.updatedAt >= startOfWeek) buckets['This week']!.push(s);
    else buckets.Older!.push(s);
  }

  return Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}
