// Copyright 2026 Awecode Contributors. Apache-2.0.
import { useEffect, useState } from 'react';
import { useAgent } from '@awecode/gui/renderer/src/hooks/useAgent';
import { useSessions } from '@awecode/gui/renderer/src/hooks/useSessions';
import { TransportContext, type TransportClient } from '@awecode/gui/renderer/src/transport/context';
import { Sidebar } from '@awecode/gui/renderer/src/components/Sidebar';
import { ChatView } from '@awecode/gui/renderer/src/components/ChatView';
import { PromptInput } from '@awecode/gui/renderer/src/components/PromptInput';
import { StatusBar } from '@awecode/gui/renderer/src/components/StatusBar';
import { WorkflowIndicator } from '@awecode/gui/renderer/src/components/WorkflowIndicator';
import { ErrorBoundary } from '@awecode/gui/renderer/src/components/ErrorBoundary';
import type { Session } from '@awecode/gui/shared/protocol';
import { apiClient } from './transport/client.js';
import { SidebarDrawer } from './components/SidebarDrawer.js';
import { MenuToggle } from './components/MenuToggle.js';
import { TranscriptView } from './components/TranscriptView.js';
import { PwaInstallPrompt } from './components/PwaInstallPrompt.js';
import { useNotifications } from './hooks/useNotifications.js';

export function App() {
  const agent = useAgent();
  const sessions = useSessions(apiClient as unknown as TransportClient);
  const notifications = useNotifications();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [viewing, setViewing] = useState<Session | null>(null);

  useEffect(() => {
    const off = agent.onDone(() => {
      notifications.notifyDone();
      if ('vibrate' in navigator) navigator.vibrate(50);
    });
    return off;
  }, [agent, notifications]);

  return (
    <ErrorBoundary>
      <TransportContext.Provider value={apiClient as unknown as TransportClient}>
        <div className="app-shell">
          <MenuToggle open={sidebarOpen} onClick={() => setSidebarOpen((v) => !v)} />
          <SidebarDrawer open={sidebarOpen} onClose={() => setSidebarOpen(false)}>
            <Sidebar
              sessions={sessions.list}
              activeId={sessions.activeId}
              onSelect={async (id) => {
                const s = await apiClient.getSession(id);
                if (s) setViewing(s);
                setSidebarOpen(false);
              }}
              onNew={() => { agent.resetForSession(); setViewing(null); setSidebarOpen(false); }}
              onDelete={(id) => void sessions.remove(id)}
              onRename={(id, title) => void sessions.rename(id, title)}
            />
            {notifications.isStandalone && notifications.permission === 'default' && (
              <div className="notify-opt-in">
                <button onClick={() => void notifications.requestPermission()}>Enable notifications</button>
              </div>
            )}
          </SidebarDrawer>

          <main className="app-main">
            {viewing ? (
              <TranscriptView session={viewing} />
            ) : (
              <>
                {agent.workflow && <WorkflowIndicator name={agent.workflow.name} />}
                <div className="app-body">
                  <ChatView messages={agent.messages} isStreaming={agent.isStreaming} />
                </div>
                <PromptInput
                  disabled={agent.isStreaming}
                  onSubmit={(v) => agent.send(v)}
                  onAbort={agent.abort}
                  isStreaming={agent.isStreaming}
                />
              </>
            )}
            <StatusBar
              model={agent.status.model}
              cwd={agent.status.cwd}
              usedTokens={agent.context.totalTokens}
              budgetTokens={agent.context.budgetTokens}
              isStreaming={agent.isStreaming}
            />
          </main>
          <PwaInstallPrompt />
        </div>
      </TransportContext.Provider>
    </ErrorBoundary>
  );
}
