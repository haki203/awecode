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

import { useEffect, useRef, useState } from 'react';

interface Props {
  disabled: boolean;
  isStreaming: boolean;
  onSubmit: (v: string) => void;
  onAbort: () => void;
}

export function PromptInput({ disabled, isStreaming, onSubmit, onAbort }: Props) {
  const [value, setValue] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 240) + 'px';
  }, [value]);

  function submit() {
    if (!value.trim()) return;
    onSubmit(value);
    setValue('');
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape' && isStreaming) {
      e.preventDefault();
      onAbort();
    }
  }

  return (
    <div className="prompt-input">
      <textarea
        ref={taRef}
        rows={1}
        placeholder={disabled ? 'agent is working…' : 'message awecode  (enter to send, shift+enter for newline)'}
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="prompt-actions">
        {isStreaming ? (
          <button
            className="btn-abort"
            onClick={onAbort}
            aria-label="Abort (esc)"
            title="Abort (esc)"
          >
            <span aria-hidden="true">■</span>
          </button>
        ) : (
          <button
            className="btn-send"
            onClick={submit}
            disabled={!value.trim()}
            aria-label="Send"
            title="Send"
          >
            <span className="btn-send-glyph" aria-hidden="true">▶</span>
          </button>
        )}
      </div>
    </div>
  );
}
