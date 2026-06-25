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

import type { ToolDefinition, ToolResult, ContextEntryPayload } from '../types.js';

// ---------------------------------------------------------------------------
// Provider interface (pluggable — swap Tavily for Brave/SerpAPI later)
// ---------------------------------------------------------------------------

export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
}

export interface WebSearchResponse {
  /** LLM-generated answer snippet, if the provider returns one. */
  answer?: string;
  results: WebSearchResult[];
}

export interface WebSearchProvider {
  search(query: string, opts: { maxResults?: number }): Promise<WebSearchResponse>;
}

// ---------------------------------------------------------------------------
// Tavily implementation (native fetch, no SDK dependency)
// ---------------------------------------------------------------------------

const TAVILY_ENDPOINT = 'https://api.tavily.com/search';
const TAVILY_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESULTS = 5;
const MAX_OUTPUT_CHARS = 50_000;

export class TavilyProvider implements WebSearchProvider {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.TAVILY_API_KEY ?? '';
  }

  async search(
    query: string,
    opts: { maxResults?: number } = {},
  ): Promise<WebSearchResponse> {
    if (!this.apiKey) {
      throw new Error(
        'TAVILY_API_KEY is not set. Get a free key at https://tavily.com and export it: $env:TAVILY_API_KEY = "tvly-..."',
      );
    }

    const maxResults = opts.maxResults ?? DEFAULT_MAX_RESULTS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TAVILY_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(TAVILY_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          query,
          max_results: maxResults,
          // answer + clean markdown content, no raw HTML noise
          include_answer: true,
          search_depth: 'basic',
        }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('aborted')) {
        throw new Error(`Tavily request timed out after ${TAVILY_TIMEOUT_MS}ms`);
      }
      throw new Error(`Tavily request failed: ${msg}`);
    }
    clearTimeout(timer);

    if (response.status === 429) {
      throw new Error(
        'Tavily rate limit exceeded (HTTP 429). Free tier: 1000 searches/month. ' +
          'Upgrade at https://tavily.com/billing or wait for the quota to reset.',
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `Tavily authentication failed (HTTP ${response.status}). Check that TAVILY_API_KEY is valid.`,
      );
    }
    if (!response.ok) {
      throw new Error(`Tavily HTTP ${response.status}: ${response.statusText}`);
    }

    const json = (await response.json()) as {
      answer?: string;
      results?: Array<{
        title: string;
        url: string;
        content: string;
      }>;
    };

    return {
      answer: json.answer,
      results: (json.results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content,
      })),
    };
  }
}

// ---------------------------------------------------------------------------
// Tool handler + definition
// ---------------------------------------------------------------------------

export interface WebSearchArgs {
  query: string;
  maxResults?: number;
}

/**
 * Process-wide provider singleton. Defaults to TavilyProvider reading
 * TAVILY_API_KEY from env. Tests and future config-driven wiring can call
 * setWebSearchProvider() to swap the implementation.
 */
let provider: WebSearchProvider | undefined;

export function getWebSearchProvider(): WebSearchProvider {
  if (!provider) provider = new TavilyProvider();
  return provider;
}

export function setWebSearchProvider(p: WebSearchProvider | undefined): void {
  provider = p;
}

function formatResponse(query: string, res: WebSearchResponse): {
  output: string;
  contextEntries: ContextEntryPayload[];
} {
  const lines: string[] = [`Query: ${query}`];
  if (res.answer) {
    lines.push('', '--- Answer ---', res.answer.trim());
  }
  lines.push('', '--- Results ---');
  const entries: ContextEntryPayload[] = [];
  let totalChars = 0;
  for (const r of res.results) {
    const snippet = r.content.trim();
    const block = `- [${r.title}](${r.url})\n  ${snippet}`;
    if (totalChars + block.length > MAX_OUTPUT_CHARS) break;
    lines.push('', block);
    entries.push({ type: 'web', url: r.url, content: snippet });
    totalChars += block.length;
  }
  return { output: lines.join('\n'), contextEntries: entries };
}

export async function webSearchTool(args: WebSearchArgs): Promise<ToolResult> {
  if (!args.query || args.query.trim() === '') {
    return { ok: false, error: 'Query must not be empty.' };
  }
  try {
    const p = getWebSearchProvider();
    const res = await p.search(args.query, { maxResults: args.maxResults });
    const { output, contextEntries } = formatResponse(args.query, res);
    return { ok: true, output, contextEntries };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export const webSearchDef: ToolDefinition = {
  name: 'web_search',
  description:
    'Search the web for up-to-date information using a natural-language query. ' +
    'Returns an answer snippet (if available) plus a list of results with title, URL, and a short content excerpt. ' +
    'Use this to discover URLs before reading them in full with web_fetch or browser_session_open. ' +
    'Powered by Tavily (requires TAVILY_API_KEY). Default 5 results.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Natural-language search query' },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results (default 5)',
      },
    },
    required: ['query'],
  },
};
