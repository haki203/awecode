// Copyright 2026 Awecode Contributors. Apache-2.0.
import { describe, it, expect } from 'vitest';
import { discoverLanIps } from '../../src/server/qr.js';

describe('qr', () => {
  it('discoverLanIps returns an array (possibly empty on CI)', () => {
    const ips = discoverLanIps();
    expect(Array.isArray(ips)).toBe(true);
    // Every entry should have ipv4 and interface fields.
    for (const ip of ips) {
      expect(typeof ip.ipv4).toBe('string');
      expect(typeof ip.interface).toBe('string');
      expect(ip.ipv4).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    }
  });
});
