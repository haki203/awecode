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

import type { ToolDefinition, ToolResult } from '../types.js';
import {
  BrowserSession,
  getBrowserSession,
  setBrowserSession,
} from './session.js';
import {
  DEFAULT_NAVIGATE_TIMEOUT_MS,
  navigate,
  click,
  typeText,
  scroll,
  snapshot,
  screenshot,
  assertHttpUrl,
} from './actions.js';

// ---------------------------------------------------------------------------
// Lifecycle tools
// ---------------------------------------------------------------------------

export interface BrowserSessionOpenArgs {
  viewport?: string;
}

export async function browserSessionOpenTool(
  args: BrowserSessionOpenArgs,
): Promise<ToolResult> {
  try {
    const session = new BrowserSession(args.viewport);
    await session.open();
    setBrowserSession(session);
    const vp = session.getViewport();
    const recognised = session.isViewportRecognised();
    const warning =
      args.viewport && !recognised
        ? `\nWARNING: viewport preset "${args.viewport}" not recognised; used default ${vp.width}x${vp.height}. Valid presets: desktop, small-desktop, tablet, mobile.`
        : '';
    return {
      ok: true,
      output: `Browser session opened.\nViewport: ${vp.width}x${vp.height}${warning}\nUse browser_navigate to go to a URL.`,
    };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to open browser session: ${(err as Error).message}`,
    };
  }
}

export interface BrowserSessionCloseArgs {}

export async function browserSessionCloseTool(
  _args: BrowserSessionCloseArgs,
): Promise<ToolResult> {
  try {
    const session = getBrowserSession();
    await session.close();
    setBrowserSession(undefined);
    return { ok: true, output: 'Browser session closed.' };
  } catch (err) {
    // No session was open (getBrowserSession throws), or close failed.
    // Idempotent: still clear the singleton and report success so the LLM
    // doesn't see a spurious error when calling close without open (or twice).
    setBrowserSession(undefined);
    const msg = (err as Error).message ?? '';
    if (/not open/i.test(msg)) {
      return { ok: true, output: 'No browser session was open.' };
    }
    return { ok: false, error: `Failed to close browser session: ${msg}` };
  }
}

// ---------------------------------------------------------------------------
// Navigation / interaction tools
// ---------------------------------------------------------------------------

export interface BrowserNavigateArgs {
  url: string;
  timeoutMs?: number;
}

export async function browserNavigateTool(
  args: BrowserNavigateArgs,
): Promise<ToolResult> {
  try {
    assertHttpUrl(args.url);
    const r = await navigate(args.url, args.timeoutMs);
    return {
      ok: true,
      output: `Navigated to ${r.url}\n\n--- Accessibility snapshot ---\n${r.snapshot ?? ''}`,
      contextEntries: r.snapshot
        ? [{ type: 'browser-snapshot', url: r.url, content: r.snapshot }]
        : [],
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export interface BrowserClickArgs {
  ref: string;
  element?: string;
}

export async function browserClickTool(
  args: BrowserClickArgs,
): Promise<ToolResult> {
  try {
    const r = await click(args.ref, args.element);
    return {
      ok: true,
      output: `Clicked [ref=${args.ref}]${args.element ? ` (${args.element})` : ''}.\nCurrent URL: ${r.url}\n\n--- Accessibility snapshot ---\n${r.snapshot ?? ''}`,
      contextEntries: r.snapshot
        ? [{ type: 'browser-snapshot', url: r.url, content: r.snapshot }]
        : [],
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export interface BrowserTypeArgs {
  ref: string;
  text: string;
  element?: string;
  submit?: boolean;
}

export async function browserTypeTool(
  args: BrowserTypeArgs,
): Promise<ToolResult> {
  try {
    const r = await typeText(args.ref, args.text, args.element, {
      submit: args.submit,
    });
    return {
      ok: true,
      output: `Typed into [ref=${args.ref}]${args.element ? ` (${args.element})` : ''}.\nCurrent URL: ${r.url}\n\n--- Accessibility snapshot ---\n${r.snapshot ?? ''}`,
      contextEntries: r.snapshot
        ? [{ type: 'browser-snapshot', url: r.url, content: r.snapshot }]
        : [],
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export interface BrowserScrollArgs {
  direction: 'up' | 'down';
}

export async function browserScrollTool(
  args: BrowserScrollArgs,
): Promise<ToolResult> {
  try {
    const r = await scroll(args.direction);
    return {
      ok: true,
      output: `Scrolled ${args.direction}. Current URL: ${r.url}\n\n--- Accessibility snapshot ---\n${r.snapshot ?? ''}`,
      contextEntries: r.snapshot
        ? [{ type: 'browser-snapshot', url: r.url, content: r.snapshot }]
        : [],
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export interface BrowserSnapshotArgs {}

export async function browserSnapshotTool(
  _args: BrowserSnapshotArgs,
): Promise<ToolResult> {
  try {
    const snap = await snapshot();
    const url = getBrowserSession().getCurrentUrl();
    return {
      ok: true,
      output: `Current URL: ${url}\n\n--- Accessibility snapshot ---\n${snap}`,
      contextEntries: [
        { type: 'browser-snapshot', url, content: snap },
      ],
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export interface BrowserScreenshotArgs {
  ref?: string;
  element?: string;
}

export async function browserScreenshotTool(
  args: BrowserScreenshotArgs,
): Promise<ToolResult> {
  try {
    const r = await screenshot(args);
    const note =
      'Screenshot captured. Pass it to your vision capability to inspect the page visually. ' +
      'For text-based inspection use browser_snapshot instead.';
    return {
      ok: true,
      output: note,
      contextEntries: [
        {
          type: 'image',
          url: r.url,
          mimeType: r.mimeType,
          base64: r.base64,
          content: `data:${r.mimeType};base64,${r.base64}`,
        },
      ],
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ---------------------------------------------------------------------------
// Tool definitions (LLM-facing)
// ---------------------------------------------------------------------------

const REFS_NOTE =
  'Refs in the accessibility snapshot (e.g. [ref=e3]) are valid only until the next navigation. ' +
  'After browser_navigate, the new snapshot already carries fresh refs you can use directly.';

export const browserSessionOpenDef: ToolDefinition = {
  name: 'browser_session_open',
  description:
    'Open a persistent headless Chromium session. Required before any other browser_* tool. ' +
    'One Chromium process is shared across all browser_* calls until browser_session_close. ' +
    'The session is isolated: no cookies, no user profile, fresh context. ' +
    'Optional viewport preset: "desktop" (1280x800), "small-desktop" (900x600, default), "tablet" (768x1024), "mobile" (360x640).',
  parameters: {
    type: 'object',
    properties: {
      viewport: {
        type: 'string',
        description:
          'Viewport preset: desktop | small-desktop | tablet | mobile (default small-desktop)',
      },
    },
  },
};

export const browserSessionCloseDef: ToolDefinition = {
  name: 'browser_session_close',
  description:
    'Close the browser session and free the Chromium process. Call when finished with all browser work.',
  parameters: { type: 'object', properties: {} },
};

export const browserNavigateDef: ToolDefinition = {
  name: 'browser_navigate',
  description:
    'Navigate the browser to a URL and return a fresh accessibility snapshot with element refs. ' +
    `This renders JavaScript, unlike web_fetch. ${DEFAULT_NAVIGATE_TIMEOUT_MS}ms timeout default. ` +
    REFS_NOTE,
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Absolute http(s) URL to navigate to' },
      timeoutMs: {
        type: 'number',
        description: `Navigation timeout in ms (default ${DEFAULT_NAVIGATE_TIMEOUT_MS})`,
      },
    },
    required: ['url'],
  },
};

export const browserClickDef: ToolDefinition = {
  name: 'browser_click',
  description:
    'Click an element identified by its ref from the latest accessibility snapshot, ' +
    'then return a fresh snapshot. If the click triggers a navigation the new page is captured. ' +
    REFS_NOTE,
  parameters: {
    type: 'object',
    properties: {
      ref: { type: 'string', description: 'Element ref, e.g. "e3" (from a snapshot)' },
      element: {
        type: 'string',
        description: 'Optional human-readable description of the target element',
      },
    },
    required: ['ref'],
  },
};

export const browserTypeDef: ToolDefinition = {
  name: 'browser_type',
  description:
    'Fill text into an input/textarea identified by ref, then return a fresh snapshot. ' +
    'Set submit=true to press Enter after filling (useful for search boxes / login forms). ' +
    REFS_NOTE,
  parameters: {
    type: 'object',
    properties: {
      ref: { type: 'string', description: 'Element ref of the input field' },
      text: { type: 'string', description: 'Text to type' },
      element: { type: 'string', description: 'Optional description of the target element' },
      submit: {
        type: 'boolean',
        description: 'If true, press Enter after typing (default false)',
      },
    },
    required: ['ref', 'text'],
  },
};

export const browserScrollDef: ToolDefinition = {
  name: 'browser_scroll',
  description:
    'Scroll the page up or down by one viewport step (~600px) and return a fresh snapshot. ' +
    'Useful for triggering lazy-loaded content or inspecting below-the-fold sections.',
  parameters: {
    type: 'object',
    properties: {
      direction: {
        type: 'string',
        enum: ['up', 'down'],
        description: '"up" or "down"',
      },
    },
    required: ['direction'],
  },
};

export const browserSnapshotDef: ToolDefinition = {
  name: 'browser_snapshot',
  description:
    'Re-capture the accessibility tree as YAML with element refs, without performing any action. ' +
    'Use this when the page changed (e.g. after an async update) and you need fresh refs before clicking. ' +
    '~30k character cap; large pages are progressively depth-limited. ' +
    REFS_NOTE,
  parameters: { type: 'object', properties: {} },
};

export const browserScreenshotDef: ToolDefinition = {
  name: 'browser_screenshot',
  description:
    'Capture a screenshot of the current page (or a single element by ref) as a base64 image. ' +
    'Use this only when you need visual/layout information that the accessibility snapshot does not carry ' +
    '(colors, spacing, hover states, images). Screenshots cost significantly more tokens than snapshots. ' +
    'Capped at ~320KB; oversized captures are downscaled automatically.',
  parameters: {
    type: 'object',
    properties: {
      ref: {
        type: 'string',
        description: 'Optional element ref to screenshot just that element instead of the whole page',
      },
      element: { type: 'string', description: 'Optional description of the target element' },
    },
  },
};

export const BROWSER_TOOL_DEFS: ToolDefinition[] = [
  browserSessionOpenDef,
  browserSessionCloseDef,
  browserNavigateDef,
  browserClickDef,
  browserTypeDef,
  browserScrollDef,
  browserSnapshotDef,
  browserScreenshotDef,
];

type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

function adapt<A extends object>(h: (args: A) => Promise<ToolResult>): ToolHandler {
  return (args: Record<string, unknown>) => h(args as A);
}

export const BROWSER_TOOL_HANDLERS: Record<string, ToolHandler> = {
  [browserSessionOpenDef.name]: adapt<BrowserSessionOpenArgs>(browserSessionOpenTool),
  [browserSessionCloseDef.name]: adapt<BrowserSessionCloseArgs>(browserSessionCloseTool),
  [browserNavigateDef.name]: adapt<BrowserNavigateArgs>(browserNavigateTool),
  [browserClickDef.name]: adapt<BrowserClickArgs>(browserClickTool),
  [browserTypeDef.name]: adapt<BrowserTypeArgs>(browserTypeTool),
  [browserScrollDef.name]: adapt<BrowserScrollArgs>(browserScrollTool),
  [browserSnapshotDef.name]: adapt<BrowserSnapshotArgs>(browserSnapshotTool),
  [browserScreenshotDef.name]: adapt<BrowserScreenshotArgs>(browserScreenshotTool),
};
