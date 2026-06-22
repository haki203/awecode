// Copyright 2026 Awecode Contributors. Apache-2.0.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  listSessionsInWorkspace,
  loadSession,
  deleteSession,
  renameSession,
} from '@awecode/agent/persistence/sessions';
import { verifyBearer } from './auth.js';

export interface RouterCtx {
  token: string;
  cwd: string;
  staticRoot: string | null;
}

export interface RouterResult {
  status: number;
  body: string;
  contentType: string;
}

export interface Router {
  handle(req: SimplifiedReq): Promise<RouterResult>;
}

interface SimplifiedReq {
  method?: string;
  url?: string;
  headers: { authorization?: string; [k: string]: string | undefined };
  body?: string;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

export function createRouter(ctx: RouterCtx): Router {
  async function handle(req: SimplifiedReq): Promise<RouterResult> {
    const url = new URL(req.url ?? '/', 'http://x');
    const path = url.pathname;
    const method = (req.method ?? 'GET').toUpperCase();

    // Public PWA shell
    if (path === '/' || path === '/index.html') return serveIndex(ctx);
    if (path === '/manifest.webmanifest') return serveAsset(ctx, '/manifest.webmanifest');
    if (path === '/sw.js') return serveAsset(ctx, '/sw.js');
    if (path.startsWith('/assets/')) return serveAsset(ctx, path);

    // Authenticated API
    if (path.startsWith('/api/')) {
      if (!verifyBearer(req as unknown as IncomingMessage, ctx.token)) {
        return json(401, { error: 'invalid token' });
      }
      if (path === '/api/sessions' && method === 'GET') {
        return json(200, listSessionsInWorkspace(ctx.cwd));
      }
      const m = path.match(/^\/api\/sessions\/([^/]+)$/);
      if (m) {
        const id = decodeURIComponent(m[1]!);
        if (!/^[A-Za-z0-9_-]+$/.test(id)) {
          return json(400, { error: 'invalid session id' });
        }
        if (method === 'GET') {
          const s = loadSession(id);
          return s ? json(200, s) : json(404, { error: 'not found' });
        }
        if (method === 'DELETE') {
          deleteSession(id);
          return json(200, { ok: true });
        }
        if (method === 'PATCH') {
          const body = JSON.parse(req.body ?? '{}') as { title?: string };
          const meta = renameSession(id, body.title ?? '');
          return meta ? json(200, meta) : json(404, { error: 'not found' });
        }
      }
      return json(404, { error: 'not found' });
    }

    // SPA fallback
    return serveIndex(ctx);
  }

  return { handle };
}

function json(status: number, body: unknown): RouterResult {
  return { status, body: JSON.stringify(body), contentType: MIME['.json']! };
}

function serveIndex(ctx: RouterCtx): RouterResult {
  if (!ctx.staticRoot) {
    return { status: 200, body: '<!-- PWA shell placeholder; build renderer first -->', contentType: MIME['.html']! };
  }
  const indexPath = resolve(ctx.staticRoot, 'index.html');
  try {
    const body = readFileSync(indexPath, 'utf8');
    return { status: 200, body, contentType: MIME['.html']! };
  } catch {
    return { status: 404, body: 'index.html not found', contentType: MIME['.html']! };
  }
}

function serveAsset(ctx: RouterCtx, assetPath: string): RouterResult {
  if (!ctx.staticRoot) return json(404, { error: 'no static root' });
  const fullPath = resolve(ctx.staticRoot, assetPath.replace(/^\//, ''));
  const normalizedRoot = resolve(ctx.staticRoot);
  if (!fullPath.startsWith(normalizedRoot)) return json(403, { error: 'forbidden' });
  const ext = assetPath.slice(assetPath.lastIndexOf('.'));
  try {
    const body = readFileSync(fullPath);
    return { status: 200, body: body.toString('utf8'), contentType: MIME[ext] ?? 'application/octet-stream' };
  } catch {
    return json(404, { error: 'not found' });
  }
}

/** Glue: adapt the simplified Router to a real IncomingMessage/ServerResponse pair. */
export function attachRouter(server: import('node:http').Server, ctx: RouterCtx): void {
  const router = createRouter(ctx);
  server.on('request', async (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks).toString('utf8');
    const result = await router.handle({
      method: req.method,
      url: req.url,
      headers: req.headers as { [k: string]: string },
      body,
    });
    res.writeHead(result.status, { 'Content-Type': result.contentType });
    res.end(result.body);
  });
}
