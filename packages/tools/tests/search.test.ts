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

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import {
  webSearchTool,
  TavilyProvider,
  setWebSearchProvider,
  getWebSearchProvider,
  type WebSearchProvider,
} from '../src/web/search.js';

// ---------------------------------------------------------------------------
// TavilyProvider — mock global fetch
// ---------------------------------------------------------------------------

describe('TavilyProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TAVILY_API_KEY;
  });

  function mockTavilyResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  it('throws a clear actionable error when TAVILY_API_KEY is missing', async () => {
    delete process.env.TAVILY_API_KEY;
    const p = new TavilyProvider();
    await expect(p.search('hello')).rejects.toThrow(/TAVILY_API_KEY is not set/);
  });

  it('reads the key from env when not passed explicitly', async () => {
    process.env.TAVILY_API_KEY = 'env-key';
    const fetchSpy = vi.fn().mockResolvedValue(
      mockTavilyResponse({ answer: 'hi', results: [] }),
    );
    vi.stubGlobal('fetch', fetchSpy);
    const p = new TavilyProvider();
    const res = await p.search('hello');
    expect(res.answer).toBe('hi');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer env-key',
    });
  });

  it('maps 429 to an actionable rate-limit message', async () => {
    process.env.TAVILY_API_KEY = 'k';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockTavilyResponse({ detail: 'too many' }, 429)),
    );
    const p = new TavilyProvider('k');
    await expect(p.search('x')).rejects.toThrow(/rate limit exceeded/);
  });

  it('maps 401/403 to an auth error', async () => {
    process.env.TAVILY_API_KEY = 'k';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockTavilyResponse({}, 401)),
    );
    const p = new TavilyProvider('k');
    await expect(p.search('x')).rejects.toThrow(/authentication failed/);
  });

  it('passes max_results in the body and maps the response shape', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      mockTavilyResponse({
        answer: 'A',
        results: [
          { title: 'T1', url: 'https://a.test', content: 'C1' },
          { title: 'T2', url: 'https://b.test', content: 'C2' },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchSpy);
    const p = new TavilyProvider('k');
    const res = await p.search('q', { maxResults: 7 });
    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.max_results).toBe(7);
    expect(body.include_answer).toBe(true);
    expect(res.results).toHaveLength(2);
    expect(res.results[0]).toMatchObject({ title: 'T1', url: 'https://a.test' });
  });

  it('reports timeout via AbortController', async () => {
    // Simulate fetch rejecting with an AbortError (as the real fetch does when
    // the AbortController fires). The provider maps any error containing
    // "aborted" to a "timed out" message — verified here without waiting the
    // full 30s real timeout.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        const e = new Error('The operation was aborted');
        (e as Error & { name: string }).name = 'AbortError';
        return Promise.reject(e);
      }),
    );
    const p = new TavilyProvider('k');
    await expect(p.search('x')).rejects.toThrow(/timed out/);
  });
});

// ---------------------------------------------------------------------------
// webSearchTool handler — mock the provider via setWebSearchProvider
// ---------------------------------------------------------------------------

describe('webSearchTool', () => {
  const realProvider = getWebSearchProvider();

  beforeEach(() => {
    // Inject a controllable fake provider so we test the handler wiring
    // independently of Tavily network behaviour.
    const fake: WebSearchProvider = {
      search: vi.fn(),
    };
    setWebSearchProvider(fake);
  });

  afterEach(() => {
    setWebSearchProvider(realProvider);
  });

  it('returns empty-query error before calling the provider', async () => {
    const r = await webSearchTool({ query: '   ' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/empty/i);
    expect(getWebSearchProvider().search).not.toHaveBeenCalled();
  });

  it('formats answer + results as markdown and emits web context entries', async () => {
    (getWebSearchProvider().search as ReturnType<typeof vi.fn>).mockResolvedValue({
      answer: 'The answer.',
      results: [
        { title: 'First', url: 'https://first.test', content: 'first snippet' },
        { title: 'Second', url: 'https://second.test', content: 'second snippet' },
      ],
    });

    const r = await webSearchTool({ query: 'what is x' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.output).toContain('Query: what is x');
      expect(r.output).toContain('--- Answer ---');
      expect(r.output).toContain('The answer.');
      expect(r.output).toContain('[First](https://first.test)');
      expect(r.output).toContain('first snippet');
      // Each result becomes a typed web entry carrying the source URL
      expect(r.contextEntries).toHaveLength(2);
      expect(r.contextEntries?.[0]?.type).toBe('web');
      expect(r.contextEntries?.[0]?.url).toBe('https://first.test');
      expect(r.contextEntries?.[1]?.url).toBe('https://second.test');
    }
  });

  it('forwards maxResults to the provider', async () => {
    const spy = getWebSearchProvider().search as ReturnType<typeof vi.fn>;
    spy.mockResolvedValue({ results: [] });
    await webSearchTool({ query: 'q', maxResults: 9 });
    expect(spy).toHaveBeenCalledWith('q', { maxResults: 9 });
  });

  it('surfaces provider errors as ToolResult.ok=false', async () => {
    (getWebSearchProvider().search as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Tavily rate limit exceeded (HTTP 429). Free tier: 1000/month.'),
    );
    const r = await webSearchTool({ query: 'q' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/rate limit exceeded/);
  });

  it('omits the Answer section when the provider returns no answer', async () => {
    (getWebSearchProvider().search as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: [{ title: 'Only', url: 'https://only.test', content: 'c' }],
    });
    const r = await webSearchTool({ query: 'q' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.output).not.toContain('--- Answer ---');
      expect(r.output).toContain('[Only](https://only.test)');
    }
  });
});
