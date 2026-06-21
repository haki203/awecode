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
 * Polls every 30 seconds while the document is visible; pauses when hidden
 * to save energy. Always refreshes immediately on user actions (open,
 * remove, rename).
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

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const update = () => {
      if (document.hidden) {
        if (timer) { clearInterval(timer); timer = null; }
      } else {
        void refresh();
        timer = setInterval(() => void refresh(), 30_000);
      }
    };
    update();
    document.addEventListener('visibilitychange', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      if (timer) clearInterval(timer);
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
