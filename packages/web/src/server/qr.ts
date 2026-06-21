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

import os from 'node:os';
import QRCode from 'qrcode';

export interface LanIp {
  ipv4: string;
  interface: string;
}

/**
 * Enumerate LAN IPv4 addresses on this machine. Excludes:
 *   - loopback (127.x.x.x, ::1)
 *   - link-local (169.254.x.x)
 *
 * Sorts private ranges (10/8, 172.16-31/12, 192.168/16) first so the most
 * useful address for QR codes appears at index 0.
 */
export function discoverLanIps(): LanIp[] {
  const ifaces = os.networkInterfaces();
  const result: LanIp[] = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    for (const a of addrs) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (a.address.startsWith('169.254.')) continue;
      result.push({ ipv4: a.address, interface: name });
    }
  }
  result.sort((a, b) => {
    const aPrivate = isPrivateLan(a.ipv4);
    const bPrivate = isPrivateLan(b.ipv4);
    if (aPrivate && !bPrivate) return -1;
    if (!aPrivate && bPrivate) return 1;
    return 0;
  });
  return result;
}

function isPrivateLan(ip: string): boolean {
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('172.')) {
    const second = parseInt(ip.split('.')[1] ?? '0', 10);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

export interface QrOutput {
  localUrl: string;
  networkUrls: string[];
  mdnsUrl: string | null;
  token: string;
  asciiQr: string;
}

/**
 * Render the QR code and assemble URLs for the startup banner.
 * The QR encodes the first network URL with the token as a query string
 * so the phone can scan-and-open without typing.
 */
export async function renderQr(opts: {
  port: number;
  token: string;
  mdnsName: string | null;
  tls: boolean;
}): Promise<QrOutput> {
  const protocol = opts.tls ? 'https' : 'http';
  const localUrl = `${protocol}://localhost:${opts.port}`;
  const lanIps = discoverLanIps();
  const networkUrls = lanIps.map((ip) => `${protocol}://${ip.ipv4}:${opts.port}`);
  const mdnsUrl = opts.mdnsName ? `${protocol}://${opts.mdnsName}.local:${opts.port}` : null;
  // QR encodes the first network URL with token as query.
  const qrTarget = `${networkUrls[0] ?? localUrl}/?token=${opts.token}`;
  const asciiQr = await QRCode.toString(qrTarget, { type: 'terminal', small: true });
  return { localUrl, networkUrls, mdnsUrl, token: opts.token, asciiQr };
}

/**
 * Format the startup banner shown in the terminal when the server starts.
 * Box-drawing chars make it visually distinct from log noise.
 */
export function formatStartupBanner(out: QrOutput): string {
  const lines: string[] = [];
  lines.push('┌──────────────────────────────────────────────┐');
  lines.push('│  awecode web ready                            │');
  lines.push('│                                                │');
  lines.push(`│  Local:        ${out.localUrl}`.padEnd(49) + '│');
  if (out.networkUrls[0]) {
    lines.push(`│  Network:      ${out.networkUrls[0]}`.padEnd(49) + '│');
  }
  if (out.mdnsUrl) {
    lines.push(`│  mDNS:         ${out.mdnsUrl}`.padEnd(49) + '│');
  }
  lines.push(`│  Token:        ${out.token}`.padEnd(49) + '│');
  lines.push('│                                                │');
  lines.push('│  Scan QR to open (URL contains token):        │');
  lines.push('│                                                │');
  lines.push('│  Ctrl+C to stop                                │');
  lines.push('└──────────────────────────────────────────────┘');
  lines.push('');
  lines.push(out.asciiQr);
  return lines.join('\n');
}
