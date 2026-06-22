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

import { useCallback, useEffect, useState } from 'react';
import type { SessionMeta, SessionMessage } from '../../../shared/protocol.js';
import type { TransportClient } from '../transport/context.js';

export interface UseSessions {
  list: SessionMeta[];
  activeId: string | null;
  refresh: () => Promise<void>;
  open: (id: string) => Promise<{ meta: SessionMeta; messages: SessionMessage[] } | null>;
  remove: (id: string) => Promise<void>;
  rename: (id: string, title: string) => Promise<void>;
}

/**
 * Shared session-list hook. Replaces Sidebar's internal useEffect fetch.
 * Used by both Desktop (via TransportContext's electronClient) and Web
 * (via apiClient).
 *
 * Desktop refreshes event-driven via `onSessionUpdated` (no polling); Web
 * falls back to a one-shot refresh on mount and after user actions, plus a
 * refresh when the tab becomes visible again.
 */
export function useSessions(client: TransportClient): UseSessions {
  const [list, setList] = useState<SessionMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setList(await client.listSessions());
    } catch {
      // Silent — transport errors are surfaced separately.
    }
  }, [client]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Event-driven refresh: when the main process saves a session, it emits
  // `session:updated` with the fresh metadata. We patch the matching item
  // in the list in place (no full refetch needed). Falls back to no-op when
  // the transport doesn't implement onSessionUpdated (Web).
  useEffect(() => {
    if (!client.onSessionUpdated) return;
    const off = client.onSessionUpdated((meta) => {
      setList((prev) => {
        const idx = prev.findIndex((s) => s.id === meta.id);
        if (idx === -1) {
          // New session (first save after creation) — prepend.
          return [meta, ...prev];
        }
        const next = [...prev];
        next[idx] = meta;
        // Re-sort by updatedAt descending so recent sessions bubble up.
        return next.sort((a, b) => b.updatedAt - a.updatedAt);
      });
    });
    return off;
  }, [client]);

  // Visibility-based refresh: when the user returns to the tab after
  // switching away, do a one-shot refresh to catch up on anything missed.
  // This replaces the old 30s poll — we don't poll on a timer anymore.
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  const open = useCallback(async (id: string) => {
    const session = await client.getSession(id);
    if (!session) return null;
    setActiveId(id);
    return { meta: stripMessages(session), messages: session.messages };
  }, [client]);

  const remove = useCallback(async (id: string) => {
    await client.deleteSession(id);
    if (id === activeId) setActiveId(null);
    await refresh();
  }, [activeId, client, refresh]);

  const rename = useCallback(async (id: string, title: string) => {
    await client.renameSession(id, title);
    await refresh();
  }, [client, refresh]);

  return { list, activeId, refresh, open, remove, rename };
}

function stripMessages<S extends { messages: unknown }>(s: S): Omit<S, 'messages'> {
  const { messages: _m, ...meta } = s;
  void _m;
  return meta;
}
