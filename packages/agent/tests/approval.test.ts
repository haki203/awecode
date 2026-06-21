import { describe, it, expect } from 'vitest';
import { ApprovalQueue } from '../src/approval.js';
import type { ApprovalDecision } from '../src/approval.js';
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
    q.enqueue({ ...mockDiff, filePath: 'other.ts' });
    expect(snap).toHaveLength(1); // unchanged
    expect(q.pending).toHaveLength(2);
  });

  it('enqueued request has unique id', () => {
    const q = new ApprovalQueue();
    const r1 = q.enqueue({ ...mockDiff, filePath: 'a.ts' });
    const r2 = q.enqueue({ ...mockDiff, filePath: 'b.ts' });
    expect(r1.id).not.toBe(r2.id);
  });

  it('dedups identical diffs (same content hash) enqueued twice', () => {
    // A model that re-emits the same diff across iterations must not produce
    // duplicate approval requests.
    const q = new ApprovalQueue();
    const r1 = q.enqueue(mockDiff);
    const r2 = q.enqueue(mockDiff);
    expect(r2.id).toBe(r1.id);
    expect(q.pending).toHaveLength(1);
  });

  it('dedup persists after dequeue (reviewed diff cannot re-enter)', () => {
    const q = new ApprovalQueue();
    q.enqueue(mockDiff);
    q.dequeue();
    q.enqueue(mockDiff);
    expect(q.pending).toHaveLength(0);
  });

  it('dedup honours filePath and block content (distinct diffs not merged)', () => {
    const q = new ApprovalQueue();
    q.enqueue(mockDiff);
    q.enqueue({ ...mockDiff, filePath: 'src/bar.ts' });
    q.enqueue({
      ...mockDiff,
      blocks: [{ search: 'other\n', replace: 'new\n' }],
    });
    expect(q.pending).toHaveLength(3);
  });
});

describe('ApprovalDecision type', () => {
  it('accepts 7 values: accept, reject, edit, skip, skip_all, accept_all, quit', () => {
    const decisions: ApprovalDecision[] = [
      'accept',
      'reject',
      'edit',
      'skip',
      'skip_all',
      'accept_all',
      'quit',
    ];
    expect(decisions).toHaveLength(7);
    expect(new Set(decisions).size).toBe(7);
  });
});
