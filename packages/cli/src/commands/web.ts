// Copyright 2026 Awecode Contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { startServer } from '@awecode/web';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

interface Opts {
  port: number;
  host: string;
  tls: boolean;
  mdns: { name: string } | null;
  staticRoot: string | null;
}

function parseArgs(args: string[]): Opts {
  const opts: Opts = {
    port: 5174,
    host: '0.0.0.0',
    tls: true,
    mdns: null,
    staticRoot: null,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--port' || a === '-p') {
      opts.port = parseInt(args[++i] ?? '', 10) || opts.port;
    } else if (a === '--host') {
      opts.host = args[++i] ?? opts.host;
    } else if (a === '--no-tls' || a === '--insecure') {
      opts.tls = false;
    } else if (a === '--mdns') {
      const name = args[++i] ?? 'awecode';
      opts.mdns = { name };
    } else if (a === '--no-mdns') {
      opts.mdns = null;
    }
  }
  return opts;
}

/**
 * Locate the built renderer (vite build output). Used as the static root
 * for serving PWA assets. Returns null if not built yet.
 */
function resolveRendererDist(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  // From packages/cli/dist/commands/web.js → ../../../web/dist/renderer
  const candidates = [
    resolve(here, '../../../web/dist/renderer'),
    resolve(here, '../../web/dist/renderer'),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

/**
 * `awecode open web` — start the PWA server.
 *
 * Boots a Node HTTP(S)+WebSocket server that serves the Desktop renderer
 * as a PWA. Phone scans the QR code (printed on startup) to open the UI.
 * The agent runs in-process via ProtocolSession (see ADR-0007).
 *
 * Flags:
 *   --port <n>      default 5174
 *   --host <addr>   default 0.0.0.0 (LAN access)
 *   --no-tls        skip HTTPS (SW/PWA features degrade)
 *   --mdns [name]   advertise as <name>.local (default off)
 */
export async function openWebCommand(args: string[]): Promise<void> {
  const opts = parseArgs(args);
  opts.staticRoot = resolveRendererDist();
  await startServer({
    port: opts.port,
    host: opts.host,
    cwd: process.cwd(),
    tls: opts.tls,
    mdns: opts.mdns,
    staticRoot: opts.staticRoot,
  });
  // Server runs until SIGINT/SIGTERM (handled in startServer).
}
