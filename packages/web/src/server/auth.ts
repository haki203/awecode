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

import crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';

/**
 * Generate a 12-hex-char bearer token. Sufficient entropy for LAN
 * single-user auth (48 bits); not intended for internet exposure.
 */
export function generateToken(): string {
  return crypto.randomBytes(6).toString('hex');
}

/**
 * Verify a bearer token from an HTTP request. Accepts either:
 *   - Authorization: Bearer <token>  (REST)
 *   - ?token=<token>                  (WebSocket — browsers can't set WS headers)
 *
 * Constant-time comparison via crypto.timingSafeEqual to mitigate timing
 * attacks. Length mismatches short-circuit (timingSafeEqual requires equal
 * length buffers).
 */
export function verifyBearer(req: IncomingMessage, expected: string): boolean {
  const header = req.headers.authorization ?? '';
  const url = new URL(req.url ?? '/', 'http://x');
  const candidate = header.startsWith('Bearer ')
    ? header.slice(7).trim()
    : (url.searchParams.get('token') ?? '');
  if (!candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
