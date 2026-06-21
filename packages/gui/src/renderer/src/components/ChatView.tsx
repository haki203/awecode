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

import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../hooks/useAgent.js';
import { Markdown } from './Markdown.js';

interface Props {
  messages: ChatMessage[];
  isStreaming: boolean;
}

export function ChatView({ messages, isStreaming }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div className="chat-view" ref={scrollRef}>
      {messages.length === 0 && (
        <div className="chat-empty">
          <h1>awecode</h1>
          <p>Ask anything. The agent can read files, run commands, and edit code.</p>
        </div>
      )}
      {messages.map((m, i) => (
        <MessageRow key={i} msg={m} />
      ))}
      {isStreaming && <span className="stream-cursor">▋</span>}
    </div>
  );
}

function MessageRow({ msg }: { msg: ChatMessage }) {
  if (msg.role === 'user') {
    return (
      <div className="msg msg-user">
        <span className="msg-glyph">❯</span>
        <div className="msg-body">{msg.content}</div>
      </div>
    );
  }
  if (msg.role === 'assistant') {
    return (
      <div className="msg msg-agent">
        <span className="msg-glyph">●</span>
        <div className="msg-body">
          <Markdown>{msg.content}</Markdown>
        </div>
      </div>
    );
  }
  if (msg.role === 'tool') {
    return (
      <div className="msg msg-tool">
        <span className="msg-glyph">↳</span>
        <div className="msg-body">{msg.content}</div>
      </div>
    );
  }
  return (
    <div className="msg msg-error">
      <span className="msg-glyph">!</span>
      <div className="msg-body">{msg.content}</div>
    </div>
  );
}
