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
import { useAgent } from './hooks/useAgent.js';
import { WorkspaceSidebar } from './components/WorkspaceSidebar.js';
import { ChatView } from './components/ChatView.js';
import { PromptInput } from './components/PromptInput.js';
import { StatusBar } from './components/StatusBar.js';
import { ContextPanel } from './components/ContextPanel.js';
import { WorkflowIndicator } from './components/WorkflowIndicator.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { TransportContext } from './transport/context.js';
import { electronClient } from './transport/electron-client.js';

export function App() {
  return (
    <ErrorBoundary>
      <TransportContext.Provider value={electronClient}>
        <AppInner />
      </TransportContext.Provider>
    </ErrorBoundary>
  );
}

function AppInner() {
  const agent = useAgent();
  const [showContext, setShowContext] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [currentCwd, setCurrentCwd] = useState<string>('');

  // Initial sync: pull persisted active session. (Workspace state is now owned
  // by WorkspaceSidebar via useWorkspace; we only seed currentCwd here for the
  // StatusBar fallback before the first agent 'ready' event arrives.)
  useEffect(() => {
    void (async () => {
      const cwd = await window.awecode.workspaceCurrent();
      setCurrentCwd(cwd);
      const session = await window.awecode.currentSession();
      if (session) setActiveSessionId(session.id);
    })();
  }, []);

  // Reset renderer state whenever the bridge swaps session (new chat,
  // switch, workspace change). When reopening a past session, also load the
  // persisted messages so the transcript is visible immediately.
  useEffect(() => {
    const off = window.awecode.onSessionLoaded(({ session, messages }) => {
      setActiveSessionId(session.id);
      agent.resetForSession();
      if (messages && messages.length > 0) {
        agent.loadMessages(messages);
      }
    });
    return off;
  }, [agent]);

  const handleNew = useCallback(async () => {
    const s = await window.awecode.newSession();
    if (s) setActiveSessionId(s.id);
    agent.resetForSession();
  }, [agent]);

  const handleSelect = useCallback(
    (id: string) => {
      setActiveSessionId(id);
      agent.resetForSession();
    },
    [agent],
  );

  return (
    <div className="app-shell">
      <WorkspaceSidebar
        activeSessionId={activeSessionId}
        onSelectSession={handleSelect}
        onNewSession={handleNew}
      />
      <main className="app-main">
        {agent.workflow && <WorkflowIndicator name={agent.workflow.name} />}
        <div className="app-body">
          {showContext ? (
            <ContextPanel
              entries={agent.context.entries}
              totalTokens={agent.context.totalTokens}
              budgetTokens={agent.context.budgetTokens}
              onClose={() => setShowContext(false)}
            />
          ) : (
            <ChatView
              messages={agent.messages}
              isStreaming={agent.isStreaming}
            />
          )}
        </div>
        {!showContext && (
          <PromptInput
            disabled={agent.isStreaming}
            onSubmit={(v) => agent.send(v)}
            onAbort={agent.abort}
            isStreaming={agent.isStreaming}
          />
        )}
        <StatusBar
          model={agent.status.model}
          cwd={agent.status.cwd ?? currentCwd}
          usedTokens={agent.context.totalTokens}
          budgetTokens={agent.context.budgetTokens}
          isStreaming={agent.isStreaming}
          showContext={showContext}
          onToggleContext={() => setShowContext((v) => !v)}
        />
      </main>
    </div>
  );
}
