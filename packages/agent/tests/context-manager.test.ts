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
