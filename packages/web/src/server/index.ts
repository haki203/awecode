// Copyright 2026 Awecode Contributors. Apache-2.0.
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { WebSocketServer } from 'ws';
import type { Server } from 'node:http';
import {
  loadConfig,
  getDefaultConfigPath,
  resolveProviderContextWindow,
} from '@awecode/llm';
import type { AwecodeConfig } from '@awecode/llm';
import { ContextManager, createProtocolSession } from '@awecode/agent';
import { generateToken } from './auth.js';
import { attachRouter } from './http-server.js';
import { attachWsServer } from './ws-bridge.js';
import { loadCerts, generateCerts } from './tls.js';
import { renderQr, formatStartupBanner } from './qr.js';
import { startMdns, type MdnsHandle } from './mdns.js';

export interface ServerOptions {
  port: number;
  host: string;
  cwd: string;
  tls: boolean;
  mdns: { name: string } | null;
  staticRoot: string | null;
}

export interface RunningServer {
  localUrl: string;
  networkUrls: string[];
  mdnsUrl: string | null;
  token: string;
  close(): Promise<void>;
}

/**
 * Boot the awecode web server. Single-process: serves static PWA + REST +
 * WebSocket, all in one Node process. The agent runs in-process via
 * ProtocolSession (see ADR-0007).
 *
 * Lifecycle:
 *   1. Load config (or exit non-zero with helpful message).
 *   2. Resolve TLS certs (mkcert) — or fall back to HTTP with warning.
 *   3. Create HTTP(S) server, attach router + WS bridge.
 *   4. Optionally start mDNS advertiser.
 *   5. Print QR + URLs + token via the startup banner.
 *   6. Register SIGINT/SIGTERM handlers for graceful shutdown.
 *
 * Returns a RunningServer handle; tests use .close() to tear down.
 */
export async function startServer(opts: ServerOptions): Promise<RunningServer> {
  const configPath = process.env.AWECODE_CONFIG_PATH ?? getDefaultConfigPath();
  const loaded = await loadConfig(configPath);
  if (!loaded) {
    console.error(`No config found at ${configPath}. Run 'awecode config' first.`);
    process.exit(1);
  }
  const config: AwecodeConfig = loaded;

  const token = generateToken();
  const activeProviderCfg = config.providers[config.activeProvider];
  const context =
    activeProviderCfg !== undefined
      ? new ContextManager(resolveProviderContextWindow(activeProviderCfg))
      : new ContextManager();

  // TLS
  let tlsCerts = opts.tls ? loadCerts() : null;
  if (opts.tls && !tlsCerts) {
    console.error('No TLS certs found at ~/.awecode/certs/. Generating via mkcert...');
    console.error('If mkcert is not installed or its CA is not trusted:');
    console.error('  Run: mkcert -install  (one-time setup)');
    tlsCerts = generateCerts({ port: opts.port, mdnsName: opts.mdns?.name ?? null });
    if (!tlsCerts) {
      console.error('Could not generate certs. Run with --no-tls to skip HTTPS.');
      process.exit(1);
    }
  }

  const server: Server = tlsCerts
    ? createHttpsServer({ cert: tlsCerts.cert, key: tlsCerts.key })
    : createServer();

  attachRouter(server, { token, cwd: opts.cwd, staticRoot: opts.staticRoot });

  const wss = new WebSocketServer({ noServer: true });
  attachWsServer(server, wss, {
    config,
    context,
    cwd: opts.cwd,
    token,
    createProtocolSession: (sOpts) => createProtocolSession(sOpts),
  });

  await new Promise<void>((r, e) => server.listen(opts.port, opts.host, r));

  let mdnsHandle: MdnsHandle | null = null;
  if (opts.mdns) {
    mdnsHandle = await startMdns({ name: opts.mdns.name, port: opts.port });
  }

  const qr = await renderQr({
    port: opts.port,
    token,
    mdnsName: opts.mdns?.name ?? null,
    tls: !!tlsCerts,
  });
  console.log(formatStartupBanner(qr));

  const shutdown = async () => {
    wss.close();
    if (mdnsHandle) mdnsHandle.stop();
    await new Promise<void>((r) => server.close(() => r()));
  };
  process.on('SIGINT', () => { void shutdown().then(() => process.exit(0)); });
  process.on('SIGTERM', () => { void shutdown().then(() => process.exit(0)); });

  return {
    localUrl: qr.localUrl,
    networkUrls: qr.networkUrls,
    mdnsUrl: qr.mdnsUrl,
    token,
    close: shutdown,
  };
}
