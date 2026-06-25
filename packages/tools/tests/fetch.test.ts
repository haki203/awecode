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

import { describe, it, expect, afterEach, vi } from 'vitest';
import { webFetchTool } from '../src/web/fetch.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeResponse(body: string, init: { contentType?: string; status?: number; statusText?: string } = {}): Response {
  const headers = new Headers();
  if (init.contentType) headers.set('content-type', init.contentType);
  return new Response(body, {
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    headers,
  });
}

describe('webFetchTool', () => {
  it('converts HTML to Markdown and strips scripts/styles/nav', async () => {
    const html =
      '<html><head><style>.x{color:red}</style></head>' +
      '<body>' +
      '<nav><a>Home</a></nav>' +
      '<header>Site Header</header>' +
      '<script>alert(1)</script>' +
      '<h1>Title</h1>' +
      '<p>Hello <a href="https://example.com">world</a></p>' +
      '<footer>Copyright</footer>' +
      '</body></html>';

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(html, { contentType: 'text/html' })));

    const result = await webFetchTool({ url: 'https://example.com' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output).toContain('# Title');
      expect(result.output).toContain('[world](https://example.com)');
      // Stripped noise should not leak
      expect(result.output).not.toContain('alert(1)');
      expect(result.output).not.toContain('color:red');
      expect(result.output).not.toContain('Site Header');
      expect(result.output).not.toContain('Copyright');
      expect(result.output).not.toContain('Home');
    }
  });

  it('preserves HTML tables as GFM markdown', async () => {
    const html =
      '<table><thead><tr><th>Name</th><th>Price</th></tr></thead>' +
      '<tbody><tr><td>Apple</td><td>$1</td></tr></tbody></table>';

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(html, { contentType: 'text/html' })));

    const result = await webFetchTool({ url: 'https://example.com' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output).toContain('| Name |');
      expect(result.output).toContain('| Apple |');
    }
  });

  it('returns JSON as fenced code block', async () => {
    const json = JSON.stringify({ name: 'awecode', version: 1 });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeResponse(json, { contentType: 'application/json' })),
    );

    const result = await webFetchTool({ url: 'https://api.example.com' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output).toContain('```json');
      expect(result.output).toContain('"name": "awecode"');
    }
  });

  it('returns plain text untouched for unknown content types', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeResponse('just plain text', { contentType: 'text/plain' })),
    );

    const result = await webFetchTool({ url: 'https://example.com/robots.txt' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output).toContain('just plain text');
    }
  });

  it('rejects non-http(s) protocols (SSRF guard)', async () => {
    const result1 = await webFetchTool({ url: 'file:///etc/passwd' });
    expect(result1.ok).toBe(false);
    if (!result1.ok) expect(result1.error).toMatch(/protocol/i);

    const result2 = await webFetchTool({ url: 'ftp://example.com' });
    expect(result2.ok).toBe(false);

    // fetch must not be called for invalid protocols
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    await webFetchTool({ url: 'file:///x' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects malformed URLs', async () => {
    const result = await webFetchTool({ url: 'not-a-url' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/invalid url/i);
  });

  it('reports HTTP error status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeResponse('forbidden', { status: 403, statusText: 'Forbidden' })),
    );

    const result = await webFetchTool({ url: 'https://example.com/secret' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/403/);
  });

  it('reports timeout via AbortController', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const e = new Error('The operation was aborted');
            (e as Error & { name: string }).name = 'AbortError';
            reject(e);
          });
        });
      }),
    );

    const result = await webFetchTool({ url: 'https://slow.example.com', timeoutMs: 50 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/timed out/i);
  });

  it('reports network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const result = await webFetchTool({ url: 'https://unreachable.example.com' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/ECONNREFUSED/);
  });

  it('truncates output beyond 50000 characters', async () => {
    const longBody = '<p>' + 'x'.repeat(60_000) + '</p>';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeResponse(longBody, { contentType: 'text/html' })),
    );

    const result = await webFetchTool({ url: 'https://example.com/long' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output).toMatch(/\[truncated/);
      expect(result.output.length).toBeLessThan(longBody.length);
    }
  });

  it('returns a web-typed context entry carrying the source URL', async () => {
    const html = '<p>hi</p>';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(html, { contentType: 'text/html' })));

    const result = await webFetchTool({ url: 'https://example.com' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.contextEntries).toBeDefined();
      const entry = result.contextEntries?.[0];
      expect(entry?.type).toBe('web');
      expect(entry?.url).toBe('https://example.com');
      expect(entry?.content).toContain('hi');
    }
  });
});
