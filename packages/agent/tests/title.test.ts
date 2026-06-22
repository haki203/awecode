import { describe, it, expect } from 'vitest';
import { deriveTitle, DEFAULT_TITLE } from '../src/persistence/sessions.js';
import type { SessionMessage } from '../src/persistence/sessions.js';

describe('deriveTitle', () => {
  it('returns DEFAULT_TITLE when no user message', () => {
    expect(deriveTitle([])).toBe(DEFAULT_TITLE);
    expect(deriveTitle([{ role: 'assistant', content: 'hi', ts: 1 }])).toBe(DEFAULT_TITLE);
  });

  it('uses first user message verbatim when short and clean', () => {
    const msgs: SessionMessage[] = [{ role: 'user', content: 'fix the login bug', ts: 1 }];
    expect(deriveTitle(msgs)).toBe('fix the login bug');
  });

  it('strips backtick code spans', () => {
    const msgs: SessionMessage[] = [{ role: 'user', content: 'fix `loginButton` handler', ts: 1 }];
    expect(deriveTitle(msgs)).toBe('fix loginButton handler');
  });

  it('strips bold and italic markdown', () => {
    const msgs: SessionMessage[] = [{ role: 'user', content: '**urgent**: *review* this', ts: 1 }];
    expect(deriveTitle(msgs)).toBe('urgent: review this');
  });

  it('strips leading @-mentions and slash commands', () => {
    const msgs: SessionMessage[] = [
      { role: 'user', content: '@agent /compact please help me debug', ts: 1 },
    ];
    expect(deriveTitle(msgs)).toBe('please help me debug');
  });

  it('strips fenced code blocks entirely', () => {
    const msgs: SessionMessage[] = [
      {
        role: 'user',
        content: 'why does this fail?\n```ts\nconst x: string = 1;\n```\npls explain',
        ts: 1,
      },
    ];
    expect(deriveTitle(msgs)).toBe('why does this fail? pls explain');
  });

  it('collapses multi-line into first sentence', () => {
    const msgs: SessionMessage[] = [
      {
        role: 'user',
        content: 'Help me refactor the auth module.\nIt currently uses callbacks.\nI want async/await.',
        ts: 1,
      },
    ];
    expect(deriveTitle(msgs)).toBe('Help me refactor the auth module.');
  });

  it('truncates to 50 chars with ellipsis on long input', () => {
    const long = 'This is an extremely long user message that goes well past any reasonable sidebar title length limit';
    const msgs: SessionMessage[] = [{ role: 'user', content: long, ts: 1 }];
    const out = deriveTitle(msgs);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.endsWith('…')).toBe(true);
    expect(out.startsWith('This is an extremely long user message')).toBe(true);
  });

  it('trims leading/trailing whitespace', () => {
    const msgs: SessionMessage[] = [{ role: 'user', content: '   hello world   ', ts: 1 }];
    expect(deriveTitle(msgs)).toBe('hello world');
  });

  it('does NOT split on ? or ! (preserves rhetorical questions)', () => {
    const msgs: SessionMessage[] = [
      { role: 'user', content: 'why fail? please explain', ts: 1 },
    ];
    expect(deriveTitle(msgs)).toBe('why fail? please explain');
  });

  it('returns DEFAULT_TITLE when content is only whitespace', () => {
    const msgs: SessionMessage[] = [{ role: 'user', content: '   ', ts: 1 }];
    expect(deriveTitle(msgs)).toBe(DEFAULT_TITLE);
  });

  it('returns DEFAULT_TITLE when content is only a code block', () => {
    const msgs: SessionMessage[] = [
      { role: 'user', content: '```ts\nconst x = 1;\n```', ts: 1 },
    ];
    expect(deriveTitle(msgs)).toBe(DEFAULT_TITLE);
  });

  it('preserves snake_case identifiers (does not mangle them as italic)', () => {
    const msgs: SessionMessage[] = [
      { role: 'user', content: 'fix my_func implementation', ts: 1 },
    ];
    expect(deriveTitle(msgs)).toBe('fix my_func implementation');
  });

  it('strips lone @mention without slash command', () => {
    const msgs: SessionMessage[] = [
      { role: 'user', content: '@agent help me debug', ts: 1 },
    ];
    expect(deriveTitle(msgs)).toBe('help me debug');
  });
});
