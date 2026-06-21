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

import type { ContextEntrySnapshot } from '../../../shared/protocol.js';

interface Props {
  entries: ContextEntrySnapshot[];
  totalTokens: number;
  budgetTokens: number;
  onClose: () => void;
}

const glyphs: Record<string, string> = {
  file: '📄',
  snippet: '✂',
  symbol: 'ƒ',
  'command-output': '▸',
  diff: 'Δ',
  'repo-map': '🗺',
};
function glyph(t: string): string {
  return glyphs[t] ?? '•';
}

export function ContextPanel({
  entries,
  totalTokens,
  budgetTokens,
  onClose,
}: Props) {
  return (
    <div className="ctx-panel">
      <div className="ctx-panel-header">
        <span className="title">Context</span>
        <span className="dim">
          {entries.length} entries · {totalTokens}/{budgetTokens} tokens
        </span>
        <button className="close" onClick={onClose}>
          esc
        </button>
      </div>
      {entries.length === 0 ? (
        <div className="ctx-empty">No context loaded yet.</div>
      ) : (
        <ul className="ctx-list">
          {entries.map((e, i) => (
            <li key={i}>
              <span className="glyph">{glyph(e.type)}</span>
              <span className="label">{e.label}</span>
              {typeof e.tokens === 'number' && (
                <span className="dim tokens">{e.tokens}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
