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

import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import type { ToolDefinition, ToolResult } from '../types.js';

export interface WebFetchArgs {
  url: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 5_000_000;
const MAX_OUTPUT_CHARS = 50_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; AwecodeBot/1.0)';

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});
turndownService.use(gfm);

export async function webFetchTool(args: WebFetchArgs): Promise<ToolResult> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(args.url);
  } catch {
    return { ok: false, error: `Invalid URL: ${args.url}` };
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return {
      ok: false,
      error: `Invalid protocol: ${parsedUrl.protocol}. Only http and https are supported.`,
    };
  }

  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(args.url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,application/json;q=0.7,*/*;q=0.6',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('aborted')) {
      return { ok: false, error: `Request timed out after ${timeoutMs}ms` };
    }
    return { ok: false, error: `Fetch failed: ${msg}` };
  }
  clearTimeout(timer);

  if (!response.ok) {
    return {
      ok: false,
      error: `HTTP ${response.status}: ${response.statusText}`,
    };
  }

  const contentType = response.headers.get('content-type') ?? '';

  const reader = response.body?.getReader();
  if (!reader) {
    return { ok: false, error: 'Failed to read response body' };
  }

  const chunks: Uint8Array[] = [];
  let totalSize = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalSize += value.length;
    if (totalSize > MAX_RESPONSE_BYTES) {
      reader.cancel();
      return {
        ok: false,
        error: `Response too large: exceeded ${MAX_RESPONSE_BYTES} bytes`,
      };
    }
    chunks.push(value);
  }

  const buffer = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  const text = new TextDecoder('utf-8').decode(buffer);

  let content: string;
  if (
    contentType.includes('text/html') ||
    contentType.includes('application/xhtml')
  ) {
    const $ = cheerio.load(text);
    $('script, style, nav, footer, header, noscript, iframe').remove();
    content = turndownService.turndown($.html() ?? '');
  } else if (contentType.includes('application/json')) {
    try {
      const json = JSON.parse(text);
      content = '```json\n' + JSON.stringify(json, null, 2) + '\n```';
    } catch {
      content = text;
    }
  } else {
    content = text;
  }

  let truncated = false;
  if (content.length > MAX_OUTPUT_CHARS) {
    content =
      content.slice(0, MAX_OUTPUT_CHARS) +
      `\n\n[truncated: showing first ${MAX_OUTPUT_CHARS} of ${content.length} characters]`;
    truncated = true;
  }
  void truncated;

  const output = [
    `URL: ${args.url}`,
    `Content-Type: ${contentType}`,
    `Size: ${totalSize} bytes`,
    '',
    '--- Content ---',
    content,
  ].join('\n');

  return {
    ok: true,
    output,
    contextEntries: [
      {
        type: 'web',
        url: args.url,
        content,
      },
    ],
  };
}

export const webFetchDef: ToolDefinition = {
  name: 'web_fetch',
  description:
    'Fetch content from an http(s) URL and return it as Markdown. ' +
    'HTML pages are stripped of scripts/styles/nav and converted to Markdown (tables preserved via GFM). ' +
    'JSON is returned as a fenced code block; other content types are returned as plain text. ' +
    'JavaScript is NOT executed — SPAs (React/Next.js) will show only their initial HTML. ' +
    'For visual inspection or JS-rendered content, a browser tool is needed (not yet implemented). ' +
    'Response body is capped at 5MB; output is capped at 50k characters.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'Absolute http(s) URL to fetch',
      },
      timeoutMs: {
        type: 'number',
        description: 'Request timeout in milliseconds (default 30000)',
      },
    },
    required: ['url'],
  },
};
