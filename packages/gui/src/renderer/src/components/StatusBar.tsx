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
  showContext,
  onToggleContext,
}: Props) {
  const pct =
    budgetTokens && usedTokens
      ? Math.min(100, Math.round((usedTokens / budgetTokens) * 100))
      : 0;
  return (
    <div className="status-bar">
      <div className="status-left">
        <span className="brand">awecode</span>
        {model && <span className="dim">· {model}</span>}
        {cwd && <span className="dim mono">· {shortCwd(cwd)}</span>}
      </div>
      <div className="status-right">
        {isStreaming && <span className="stream-dot">streaming</span>}
        <span className="ctx-meter" title={`${usedTokens ?? 0}/${budgetTokens ?? 0} tokens`}>
          <span
            className="ctx-bar"
            style={{
              width: `${pct}%`,
              background: tokenColor(usedTokens, budgetTokens),
            }}
          />
          <span className="ctx-text">
            {fmt(usedTokens)}/{fmt(budgetTokens)}
          </span>
        </span>
        <button onClick={onToggleContext} aria-pressed={showContext}>
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
