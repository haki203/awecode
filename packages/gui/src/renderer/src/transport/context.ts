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

import { useContext, createContext } from 'react';
import type {
  GuiAgentEvent,
  GuiClientCommand,
  Session,
  SessionMeta,
} from '../../../shared/protocol.js';

/**
 * Transport-agnostic client surface. Both Desktop's Electron IPC shim
 * and Web's WebSocket client implement this interface so that shared
 * hooks (useAgent, useSessions) can consume either without code changes.
 */
export interface TransportClient {
  send(cmd: GuiClientCommand): Promise<void>;
  onEvent(cb: (ev: GuiAgentEvent) => void): () => void;
  listSessions(): Promise<SessionMeta[]>;
  getSession(id: string): Promise<Session | null>;
  deleteSession(id: string): Promise<boolean>;
  renameSession(id: string, title: string): Promise<SessionMeta | null>;
}

export const TransportContext = createContext<TransportClient | null>(null);

/**
 * Use this inside any component below <TransportContext.Provider>.
 * Throws if the provider is missing — surfaces integration mistakes
 * loudly instead of silently passing undefined around.
 */
export function useTransport(): TransportClient {
  const client = useContext(TransportContext);
  if (!client) {
    throw new Error('useTransport must be used inside <TransportContext.Provider>');
  }
  return client;
}
