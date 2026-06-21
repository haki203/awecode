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

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { discoverLanIps } from './qr.js';

const CERT_DIR = resolve(homedir(), '.awecode', 'certs');

export interface TlsCerts {
  cert: Buffer;
  key: Buffer;
}

/**
 * Load existing mkcert-generated certs from ~/.awecode/certs/.
 * Returns null if not present. Does NOT auto-generate — caller decides
 * whether to call generateCerts() or fall back to HTTP.
 */
export function loadCerts(): TlsCerts | null {
  const cert = resolve(CERT_DIR, 'fullchain.pem');
  const key = resolve(CERT_DIR, 'privkey.pem');
  if (existsSync(cert) && existsSync(key)) {
    return { cert: readFileSync(cert), key: readFileSync(key) };
  }
  return null;
}

/**
 * Try to generate host certs via mkcert.
 *
 * CRITICAL: This function NEVER calls `mkcert -install`. The user must
 * have run that one-time command themselves so the local CA is trusted.
 * If `mkcert` reports the CA is not trusted, this function returns null
 * and the caller prints install instructions.
 *
 * Hosts covered: localhost, 127.0.0.1, all discovered LAN IPs, optional
 * mDNS hostname. The first run after `mkcert -install` produces certs
 * that work everywhere awecode is reachable.
 *
 * @returns null if mkcert is not on PATH or cert generation fails.
 */
export function generateCerts(opts: { port: number; mdnsName: string | null }): TlsCerts | null {
  mkdirSync(CERT_DIR, { recursive: true });
  const cert = resolve(CERT_DIR, 'fullchain.pem');
  const key = resolve(CERT_DIR, 'privkey.pem');
  const hosts = ['localhost', '127.0.0.1'];
  for (const ip of discoverLanIps()) hosts.push(ip.ipv4);
  if (opts.mdnsName) hosts.push(`${opts.mdnsName}.local`);
  try {
    execFileSync('mkcert', ['-cert-file', cert, '-key-file', key, ...hosts], { stdio: 'inherit' });
  } catch {
    return null;
  }
  if (!existsSync(cert) || !existsSync(key)) return null;
  return { cert: readFileSync(cert), key: readFileSync(key) };
}
