import { describe, it, expect } from 'vitest';
import { ContextManager } from '../src/context/manager.js';

describe('ContextManager', () => {
  it('starts empty with given budget', () => {
    const cm = new ContextManager(100_000);
    expect(cm.totalTokens).toBe(0);
    expect(cm.utilization).toBe(0);
    expect(cm.snapshot()).toHaveLength(0);
  });

  it('addFile adds entry and computes tokens', () => {
    const cm = new ContextManager();
    const entry = cm.addFile({
      path: '/tmp/foo.ts',
      content: 'export const x = 1;',
      addedBy: 'user',
    });
    expect(entry.type).toBe('file');
    expect(cm.totalTokens).toBe(entry.tokens);
    expect(cm.snapshot()).toHaveLength(1);
  });

  it('addCommandOutput adds entry', () => {
    const cm = new ContextManager();
    cm.addCommandOutput({ content: 'test output' });
    expect(cm.snapshot()).toHaveLength(1);
    expect(cm.snapshot()[0]!.type).toBe('command-output');
  });

  it('addUserMessage / addAssistantMessage track chat turns', () => {
    const cm = new ContextManager(100_000);
    cm.addUserMessage('hello');
    cm.addAssistantMessage('hi there');
    expect(cm.entryCount).toBe(2);
    expect(cm.snapshot()[0]!.type).toBe('user-message');
    expect(cm.snapshot()[0]!.addedBy).toBe('user');
    expect(cm.snapshot()[1]!.type).toBe('assistant-message');
    expect(cm.snapshot()[1]!.addedBy).toBe('agent');
    expect(cm.totalTokens).toBeGreaterThan(0);
  });

  it('addToolResult records tool result entry', () => {
    const cm = new ContextManager();
    cm.addToolResult({ toolName: 'read_file', content: 'file contents here' });
    const entry = cm.snapshot()[0]!;
    expect(entry.type).toBe('tool-result');
    expect(entry.content).toContain('read_file');
    expect(entry.content).toContain('file contents here');
  });

  it('clear() empties entries', () => {
    const cm = new ContextManager();
    cm.addUserMessage('x');
    cm.addAssistantMessage('y');
    expect(cm.entryCount).toBe(2);
    cm.clear();
    expect(cm.entryCount).toBe(0);
    expect(cm.totalTokens).toBe(0);
  });

  it('restore() replaces entries and updates budget', () => {
    const cm = new ContextManager(100_000);
    cm.addUserMessage('stale');
    expect(cm.entryCount).toBe(1);

    const records = [
      {
        id: 'rec-1',
        type: 'user-message' as const,
        content: 'hello',
        tokens: 5,
        addedAt: 100,
        addedBy: 'user' as const,
      },
      {
        id: 'rec-2',
        type: 'assistant-message' as const,
        content: 'hi there',
        tokens: 7,
        addedAt: 101,
        addedBy: 'agent' as const,
      },
    ];
    cm.restore(records, 200_000);

    // Stale entry was dropped — restore replaces, not appends.
    expect(cm.entryCount).toBe(2);
    expect(cm.snapshot()[0]!.id).toBe('rec-1');
    expect(cm.snapshot()[1]!.content).toBe('hi there');
    // Budget was updated.
    expect(cm.budgetTokens).toBe(200_000);
    expect(cm.totalTokens).toBe(12); // 5 + 7 from persisted tokens
  });

  it('restore() without budget keeps existing budget', () => {
    const cm = new ContextManager(50_000);
    cm.restore([
      { id: 'x', type: 'user-message', content: 'a', tokens: 1, addedAt: 1, addedBy: 'user' },
    ]);
    expect(cm.budgetTokens).toBe(50_000);
  });

  it('toRecords() returns shallow clones (mutations do not leak back)', () => {
    const cm = new ContextManager();
    cm.addUserMessage('original');
    const records = cm.toRecords();
    expect(records).toHaveLength(1);
    // Mutate the cloned record.
    records[0]!.content = 'mutated';
    // Internal state is unaffected.
    expect(cm.snapshot()[0]!.content).toBe('original');
  });

  it('removeEntry removes by id', () => {
    const cm = new ContextManager();
    const entry = cm.addFile({
      path: '/tmp/foo.ts',
      content: 'x',
      addedBy: 'user',
    });
    expect(cm.removeEntry(entry.id)).toBe(true);
    expect(cm.snapshot()).toHaveLength(0);
    expect(cm.totalTokens).toBe(0);
  });

  it('removeEntry returns false on missing id', () => {
    const cm = new ContextManager();
    expect(cm.removeEntry('nonexistent-uuid')).toBe(false);
  });

  it('refreshFile updates content and tokens', () => {
    const cm = new ContextManager();
    cm.addFile({
      path: '/tmp/foo.ts',
      content: 'x',
      addedBy: 'user',
    });
    const beforeTokens = cm.totalTokens;
    cm.refreshFile('/tmp/foo.ts', 'longer content with more tokens than before');
    expect(cm.totalTokens).toBeGreaterThan(beforeTokens);
  });

  it('refreshFile is no-op on missing path', () => {
    const cm = new ContextManager();
    cm.refreshFile('/tmp/never-added.ts', 'content');
    expect(cm.snapshot()).toHaveLength(0);
  });

  it('utilization = totalTokens / budget', () => {
    const cm = new ContextManager(1000);
    cm.addFile({ path: '/x', content: 'a'.repeat(100), addedBy: 'user' });
    expect(cm.utilization).toBeGreaterThan(0);
    expect(cm.utilization).toBeLessThan(1);
  });

  it('supports large budgets (e.g. 1M-token models like GLM-5.2)', () => {
    const cm = new ContextManager(1_000_000);
    expect(cm.budgetTokens).toBe(1_000_000);
    // A few hundred tokens is well under 1% utilisation — this is the
    // case the user-reported regression was about: small inputs on a
    // 1M model showing a near-empty bar instead of a pegged 100k one.
    cm.addFile({
      path: '/repo/src/index.ts',
      content: 'a'.repeat(500),
      addedBy: 'user',
    });
    expect(cm.utilization).toBeLessThan(0.01);
  });

  it('toMessages returns empty when no entries', () => {
    const cm = new ContextManager();
    expect(cm.toMessages()).toEqual([]);
  });

  it('toMessages serializes entries as system message', () => {
    const cm = new ContextManager();
    cm.addFile({ path: '/tmp/foo.ts', content: 'x', addedBy: 'user' });
    const msgs = cm.toMessages();
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.role).toBe('system');
    expect(msgs[0]!.content).toContain('/tmp/foo.ts');
    expect(msgs[0]!.content).toContain('Context entries');
  });
});
