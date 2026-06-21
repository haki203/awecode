// Copyright 2026 Awecode Contributors. Apache-2.0.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('http router', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'awecode-test-'));
    process.env.AWECODE_SESSIONS_DIR = dir;
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.AWECODE_SESSIONS_DIR;
  });

  it('GET /api/sessions without token returns 401', async () => {
    const { createRouter } = await import('../../src/server/http-server.js');
    const router = createRouter({ token: 'abc', cwd: '/proj', staticRoot: null });
    const res = await router.handle({ method: 'GET', url: '/api/sessions', headers: {} });
    expect(res.status).toBe(401);
  });

  it('GET /api/sessions with token returns array', async () => {
    const { createRouter } = await import('../../src/server/http-server.js');
    const router = createRouter({ token: 'abc', cwd: '/proj', staticRoot: null });
    const res = await router.handle({
      method: 'GET', url: '/api/sessions', headers: { authorization: 'Bearer abc' },
    });
    expect(res.status).toBe(200);
    expect(Array.isArray(JSON.parse(res.body))).toBe(true);
  });

  it('SPA fallback returns 200 with html content type', async () => {
    const { createRouter } = await import('../../src/server/http-server.js');
    const router = createRouter({ token: 'abc', cwd: '/proj', staticRoot: null });
    const res = await router.handle({ method: 'GET', url: '/random-route', headers: {} });
    expect(res.status).toBe(200);
    expect(res.contentType).toMatch(/text\/html/);
  });

  it('GET /api/sessions/:id nonexistent returns 404', async () => {
    const { createRouter } = await import('../../src/server/http-server.js');
    const router = createRouter({ token: 'abc', cwd: '/proj', staticRoot: null });
    const res = await router.handle({
      method: 'GET', url: '/api/sessions/nonexistent', headers: { authorization: 'Bearer abc' },
    });
    expect(res.status).toBe(404);
  });

  it('DELETE /api/sessions/:id returns ok', async () => {
    const { saveSession } = await import('@awecode/agent/persistence/sessions');
    const { createRouter } = await import('../../src/server/http-server.js');
    saveSession({ id: 'deleteme', title: 't', createdAt: 1, updatedAt: 1, cwd: '/proj', messages: [] });
    const router = createRouter({ token: 'abc', cwd: '/proj', staticRoot: null });
    const res = await router.handle({
      method: 'DELETE', url: '/api/sessions/deleteme', headers: { authorization: 'Bearer abc' },
    });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
  });
});
