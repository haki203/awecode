// Copyright 2026 Awecode Contributors. Apache-2.0.
import { describe, it, expect } from 'vitest';
import { generateToken, verifyBearer } from '../../src/server/auth.js';

function mockReq(opts: { auth?: string; url?: string }) {
  return {
    headers: opts.auth ? { authorization: opts.auth } : {},
    url: opts.url ?? '/',
  } as any;
}

describe('auth', () => {
  it('generateToken returns 12 hex chars', () => {
    const t = generateToken();
    expect(t).toMatch(/^[0-9a-f]{12}$/);
  });

  it('generateToken is unique across 1000 calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(generateToken());
    expect(seen.size).toBe(1000);
  });

  it('verifyBearer accepts matching Authorization header', () => {
    const t = generateToken();
    expect(verifyBearer(mockReq({ auth: `Bearer ${t}` }), t)).toBe(true);
  });

  it('verifyBearer accepts matching ?token= query', () => {
    const t = generateToken();
    expect(verifyBearer(mockReq({ url: `/?token=${t}` }), t)).toBe(true);
  });

  it('verifyBearer rejects missing auth', () => {
    expect(verifyBearer(mockReq({}), generateToken())).toBe(false);
  });

  it('verifyBearer rejects wrong token', () => {
    const t = generateToken();
    expect(verifyBearer(mockReq({ auth: `Bearer ${'0'.repeat(12)}` }), t)).toBe(false);
  });

  it('verifyBearer rejects malformed Authorization header', () => {
    const t = generateToken();
    expect(verifyBearer(mockReq({ auth: 'Basic abc' }), t)).toBe(false);
    expect(verifyBearer(mockReq({ auth: t }), t)).toBe(false); // no Bearer prefix
  });
});
