import { describe, it, expect } from 'vitest';
import { ORCHESTRATOR_PACKAGE_VERSION } from '../src/index.js';

describe('sanity', () => {
  it('exports version', () => {
    expect(ORCHESTRATOR_PACKAGE_VERSION).toBe('0.0.0');
  });
});
