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
import { PwaInstallPrompt } from './components/PwaInstallPrompt.js';
import { useNotifications } from './hooks/useNotifications.js';

/**
 * Tracks the mobile soft keyboard via the VisualViewport API and publishes
 * the visible pixel height as the CSS custom property `--app-vh` on
 * `.app-shell`. This is the robust fallback for browsers that mis-behave
 * with `100dvh` (notably older iOS Safari) — when the keyboard opens, the
 * app shell shrinks to the visible region so the prompt input and send
 * button stay on-screen instead of being covered by the keyboard.
 *
 * Browsers without `visualViewport` fall back to `100dvh` via CSS.
 */
function useMobileViewportHeight() {
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const apply = () => {
      const h = Math.round(vv.height);
      document.documentElement.style.setProperty('--app-vh', `${h}px`);
    };
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      document.documentElement.style.removeProperty('--app-vh');
    };
  }, []);
}

export function App() {
  return (
    <ErrorBoundary>
      <TransportContext.Provider value={apiClient as unknown as TransportClient}>
        <AppInner />
      </TransportContext.Provider>
    </ErrorBoundary>
  );
}

function AppInner() {
  useMobileViewportHeight();
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
  }, [agent.onDone, notifications.notifyDone]);

  return (
    <>
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
              <div className="transcript-view">
                <div className="resume-banner">
                  <span>Viewing past session · </span>
                  <button
                    onClick={() => {
                      apiClient.resume(viewing.id);
                      setViewing(null);
                    }}
                  >
                    Continue here
                  </button>
                </div>
                <div className="app-body">
                  <ChatView
                    messages={viewing.messages.map((m) => ({ role: m.role, content: m.content }))}
                    isStreaming={false}
                  />
                </div>
              </div>
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
              transportStatus={agent.transportStatus}
            />
          </main>
          <PwaInstallPrompt />
      </div>
    </>
  );
}
