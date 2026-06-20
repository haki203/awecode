import { describe, it, expect } from 'vitest';
import { ApprovalQueue } from '../src/approval.js';
import type { ParsedDiff } from '@awecode/diff';

const mockDiff: ParsedDiff = {
  filePath: 'src/foo.ts',
  blocks: [
    { search: 'old\n', replace: 'new\n' },
  ],
};

describe('ApprovalQueue', () => {
  it('starts empty', () => {
    const q = new ApprovalQueue();
    expect(q.isEmpty).toBe(true);
    expect(q.pending).toHaveLength(0);
  });

  it('enqueue adds to back, dequeue takes from front (FIFO)', () => {
    const q = new ApprovalQueue();
    const r1 = q.enqueue({ ...mockDiff, filePath: 'a.ts' });
    const r2 = q.enqueue({ ...mockDiff, filePath: 'b.ts' });
    expect(q.pending).toHaveLength(2);
    expect(q.isEmpty).toBe(false);

    const out1 = q.dequeue();
    expect(out1?.id).toBe(r1.id);
    expect(out1?.filePath).toBe('a.ts');

    const out2 = q.dequeue();
    expect(out2?.id).toBe(r2.id);
    expect(out2?.filePath).toBe('b.ts');

    expect(q.isEmpty).toBe(true);
  });

  it('dequeue on empty queue returns undefined', () => {
    const q = new ApprovalQueue();
    expect(q.dequeue()).toBeUndefined();
  });

  it('pending is a snapshot (immutable)', () => {
    const q = new ApprovalQueue();
    q.enqueue(mockDiff);
    const snap = q.pending;
    q.enqueue(mockDiff);
    expect(snap).toHaveLength(1); // unchanged
    expect(q.pending).toHaveLength(2);
  });

  it('enqueued request has unique id', () => {
    const q = new ApprovalQueue();
    const r1 = q.enqueue(mockDiff);
    const r2 = q.enqueue(mockDiff);
    expect(r1.id).not.toBe(r2.id);
  });
});
