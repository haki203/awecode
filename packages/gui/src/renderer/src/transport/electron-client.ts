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

import type { TransportClient } from './context.js';
import type { Session } from '../../../shared/protocol.js';

/**
 * Wraps the Electron preload API (window.awecode) in the shared TransportClient
 * interface so that useAgent / useSessions can consume it identically to
 * the Web WebSocket client. The global `window.awecode` shape is typed by
 * packages/gui/src/renderer/src/globals.d.ts (re-exported from the preload
 * AwecodeApi type), so any drift in the IPC contract surfaces as a typecheck
 * error here.
 *
 * Note: Desktop's preload has no direct `getSession(id)` that returns the full
 * Session. We emulate it via `openSession` (which switches the bridge to that
 * session and returns metadata). For read-only transcript views the messages
 * arrive via the `session:loaded` IPC event, not via this method. Web's client
 * has a proper `getSession` that returns the full session.
 */
export const electronClient: TransportClient = {
  send: (cmd) => window.awecode.send(cmd),
  onEvent: (cb) => window.awecode.onEvent(cb),
  listSessions: () => window.awecode.listSessions(),
  getSession: async (id) => {
    const meta = await window.awecode.openSession(id);
    if (!meta) return null;
    // Desktop's openSession triggers a session:loaded event with messages,
    // but doesn't return them synchronously. For the shared hook contract we
    // return meta with empty messages; callers needing history should listen
    // to onSessionLoaded separately.
    const session: Session = { ...meta, messages: [] };
    return session;
  },
  deleteSession: (id) => window.awecode.deleteSession(id),
  renameSession: (id, title) => window.awecode.renameSession(id, title),
};
