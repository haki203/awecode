import { describe, it, expect } from 'vitest';
import { getCompactionTrigger } from '../src/context/trigger.js';

describe('getCompactionTrigger', () => {
  it('returns none when utilization < 0.85', () => {
    expect(getCompactionTrigger(0.5).level).toBe('none');
    expect(getCompactionTrigger(0.84).level).toBe('none');
  });

  it('returns moderate at 85%', () => {
    expect(getCompactionTrigger(0.85).level).toBe('moderate');
    expect(getCompactionTrigger(0.9).level).toBe('moderate');
    expect(getCompactionTrigger(0.94).level).toBe('moderate');
  });

  it('returns severe at 95%', () => {
    expect(getCompactionTrigger(0.95).level).toBe('severe');
    expect(getCompactionTrigger(0.99).level).toBe('severe');
    expect(getCompactionTrigger(1.0).level).toBe('severe');
  });

  it('includes threshold value in result', () => {
    const r = getCompactionTrigger(0.87);
    expect(r.threshold).toBe(0.87);
  });

  it('handles edge case of 0', () => {
    expect(getCompactionTrigger(0).level).toBe('none');
  });
});
