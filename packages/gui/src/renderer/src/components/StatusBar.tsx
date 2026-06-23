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

interface Props {
  model?: string;
  cwd?: string;
  usedTokens?: number;
  budgetTokens?: number;
  isStreaming?: boolean;
  transportStatus?: 'connecting' | 'open' | 'closed';
  showContext?: boolean;
  onToggleContext?: () => void;
}

function fmt(n?: number): string {
  if (!n) return '0';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function tokenColor(used = 0, budget = 0): string {
  if (!budget) return 'var(--c-muted)';
  const r = used / budget;
  if (r > 0.9) return 'var(--c-severe)';
  if (r > 0.7) return 'var(--c-moderate)';
  return 'var(--c-ok)';
}

export function StatusBar({
  model,
  cwd,
  usedTokens,
  budgetTokens,
  isStreaming,
  transportStatus = 'open',
  showContext,
  onToggleContext,
}: Props) {
  // Treat the pre-snapshot state (both values missing) as "no data yet"
  // rather than literally 0/0 — otherwise users see an inert 0/0 bar
  // until the first `context_snapshot` frame arrives over the socket.
  const hasCtx =
    (typeof usedTokens === 'number' && usedTokens > 0) ||
    (typeof budgetTokens === 'number' && budgetTokens > 0);
  const pct =
    budgetTokens && usedTokens
      ? Math.min(100, Math.round((usedTokens / budgetTokens) * 100))
      : 0;
  return (
    <div className="status-bar" role="contentinfo">
      <div className="status-left">
        <span className="brand">awecode</span>
        {model && <span className="status-model dim">{model}</span>}
        {cwd && (
          <span className="status-cwd dim mono" title={cwd}>
            {shortCwd(cwd)}
          </span>
        )}
      </div>

      <div className="status-center">
        {isStreaming && (
          <span className="stream-dot" aria-live="polite">
            streaming
          </span>
        )}
        {transportStatus !== 'open' && (
          <span
            className="status-transport"
            title={
              transportStatus === 'connecting'
                ? 'Connecting…'
                : 'Disconnected — reconnecting…'
            }
          >
            {transportStatus === 'connecting' ? 'connecting…' : 'reconnecting…'}
          </span>
        )}
      </div>

      <div className="status-right">
        <span
          className="ctx-meter"
          title={
            hasCtx
              ? `${usedTokens ?? 0}/${budgetTokens ?? 0} tokens`
              : 'context: awaiting snapshot…'
          }
          aria-label={
            hasCtx
              ? `context ${usedTokens} of ${budgetTokens} tokens`
              : 'context awaiting snapshot'
          }
        >
          <span
            className="ctx-bar"
            style={{
              width: `${pct}%`,
              background: tokenColor(usedTokens, budgetTokens),
            }}
          />
          <span className="ctx-text">
            {hasCtx ? `${fmt(usedTokens)}/${fmt(budgetTokens)}` : '—'}
          </span>
        </span>
        <button
          className="ctx-toggle"
          onClick={onToggleContext}
          aria-pressed={showContext}
          title={showContext ? 'Hide context panel' : 'Show context panel'}
        >
          {showContext ? 'Hide ctx' : 'Show ctx'}
        </button>
      </div>
    </div>
  );
}

function shortCwd(cwd: string): string {
  const parts = cwd.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length <= 2) return cwd;
  return '…/' + parts.slice(-2).join('/');
}
