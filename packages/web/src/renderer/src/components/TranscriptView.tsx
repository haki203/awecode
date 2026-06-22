// Copyright 2026 Awecode Contributors. Apache-2.0.
import { ChatView } from '@awecode/gui/renderer/src/components/ChatView';
import type { Session } from '@awecode/gui/shared/protocol';

interface Props {
  session: Session;
}

export function TranscriptView({ session }: Props) {
  return (
    <div className="transcript-view">
      <div className="transcript-banner">Viewing past session · read-only</div>
      <ChatView
        messages={session.messages.map((m) => ({ role: m.role, content: m.content }))}
        isStreaming={false}
      />
    </div>
  );
}
