import { describe, it, expect } from 'vitest';
import { REPOMAP_PACKAGE_VERSION } from '../src/index.js';

describe('sanity', () => {
  it('exports version', () => {
    expect(REPOMAP_PACKAGE_VERSION).toBe('0.0.0');
  });
});
