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

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mocks are declared via vi.hoisted so their references exist at vi.mock
// factory evaluation time (vi.mock is hoisted above imports by vitest).
const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  click: vi.fn(),
  typeText: vi.fn(),
  scroll: vi.fn(),
  snapshot: vi.fn(),
  screenshot: vi.fn(),
  open: vi.fn(),
  close: vi.fn(),
  getCurrentUrl: vi.fn().mockReturnValue('https://mock.test'),
}));

vi.mock('../src/browser/actions.js', () => ({
  DEFAULT_NAVIGATE_TIMEOUT_MS: 30_000,
  navigate: (...a: unknown[]) => mocks.navigate(...a),
  click: (...a: unknown[]) => mocks.click(...a),
  typeText: (...a: unknown[]) => mocks.typeText(...a),
  scroll: (...a: unknown[]) => mocks.scroll(...a),
  snapshot: (...a: unknown[]) => mocks.snapshot(...a),
  screenshot: (...a: unknown[]) => mocks.screenshot(...a),
  // Real implementation — scheme guard must run even with mocked navigate.
  assertHttpUrl: (url: string) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(
        `Invalid protocol: ${parsed.protocol}. Only http and https are supported.`,
      );
    }
  },
}));

vi.mock('../src/browser/session.js', () => {
  // Stub class so `new BrowserSession()` works; each instance delegates to
  // the hoisted mock fns so per-test mockReset/mockResolvedValue apply.
  class FakeBrowserSession {
    open = mocks.open;
    close = mocks.close;
    dispose = mocks.close;
    isOpen = false;
    private vpRecognised = true;
    getViewport() {
      return { width: 900, height: 600 };
    }
    getCurrentUrl() {
      return mocks.getCurrentUrl();
    }
    setCurrentUrl() {}
    getPage() {
      return {};
    }
    isViewportRecognised() {
      return this.vpRecognised;
    }
    constructor(viewport?: unknown) {
      // Mirror real resolveViewport: if a string preset isn't in the map, mark
      // unrecognised so the warning path is exercised by tests.
      if (typeof viewport === 'string' && !['desktop', 'small-desktop', 'tablet', 'mobile'].includes(viewport)) {
        this.vpRecognised = false;
      }
    }
  }
  return {
    BrowserSession: FakeBrowserSession,
    getBrowserSession: () => ({
      getCurrentUrl: mocks.getCurrentUrl,
      getPage: () => ({}),
      getViewport: () => ({ width: 900, height: 600 }),
      setCurrentUrl: () => {},
      close: mocks.close,
      dispose: mocks.close,
    }),
    setBrowserSession: vi.fn(),
    disposeBrowserSession: vi.fn(async () => {}),
  };
});

const {
  browserSessionOpenTool,
  browserSessionCloseTool,
  browserNavigateTool,
  browserClickTool,
  browserTypeTool,
  browserScrollTool,
  browserSnapshotTool,
  browserScreenshotTool,
} = await import('../src/browser/tools.js');

const {
  mockNavigate,
  mockClick,
  mockTypeText,
  mockScroll,
  mockSnapshot,
  mockScreenshot,
  mockOpen,
  mockClose,
  mockGetCurrentUrl,
} = {
  mockNavigate: mocks.navigate,
  mockClick: mocks.click,
  mockTypeText: mocks.typeText,
  mockScroll: mocks.scroll,
  mockSnapshot: mocks.snapshot,
  mockScreenshot: mocks.screenshot,
  mockOpen: mocks.open,
  mockClose: mocks.close,
  mockGetCurrentUrl: mocks.getCurrentUrl,
};

beforeEach(() => {
  mocks.navigate.mockReset();
  mocks.click.mockReset();
  mocks.typeText.mockReset();
  mocks.scroll.mockReset();
  mocks.snapshot.mockReset();
  mocks.screenshot.mockReset();
  mocks.open.mockReset();
  mocks.close.mockReset().mockResolvedValue(undefined);
  mocks.getCurrentUrl.mockReturnValue('https://mock.test');
});

describe('browser_session_open', () => {
  it('opens a session and reports the viewport', async () => {
    mocks.open.mockResolvedValue(undefined);
    const r = await browserSessionOpenTool({});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.output).toContain('Browser session opened');
      expect(r.output).toContain('900x600');
    }
  });

  it('accepts a viewport preset', async () => {
    mocks.open.mockResolvedValue(undefined);
    const r = await browserSessionOpenTool({ viewport: 'mobile' });
    expect(r.ok).toBe(true);
  });

  it('returns ok:false when launch fails', async () => {
    mocks.open.mockRejectedValue(new Error('chromium not found'));
    const r = await browserSessionOpenTool({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/chromium not found/);
  });
});

describe('browser_session_close', () => {
  it('closes the session', async () => {
    const r = await browserSessionCloseTool({});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.output).toContain('closed');
  });
});

describe('browser_navigate', () => {
  it('returns snapshot as a browser-snapshot context entry', async () => {
    mockNavigate.mockResolvedValue({
      url: 'https://example.com',
      snapshot: '- heading "Welcome" [ref=e1]',
    });
    const r = await browserNavigateTool({ url: 'https://example.com' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.output).toContain('https://example.com');
      expect(r.output).toContain('Welcome');
      expect(r.contextEntries?.[0]?.type).toBe('browser-snapshot');
      expect(r.contextEntries?.[0]?.url).toBe('https://example.com');
    }
  });

  it('surfaces navigation errors', async () => {
    mockNavigate.mockRejectedValue(new Error('net::ERR_NAME_NOT_RESOLVED'));
    const r = await browserNavigateTool({ url: 'https://nope.invalid' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ERR_NAME_NOT_RESOLVED/);
  });

  it('rejects non-http(s) URL schemes (SSRF guard)', async () => {
    const r1 = await browserNavigateTool({ url: 'file:///C:/secret' });
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error).toMatch(/protocol/i);
    expect(mockNavigate).not.toHaveBeenCalled();

    const r2 = await browserNavigateTool({ url: 'data:text/html,<h1>x</h1>' });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toMatch(/protocol/i);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('browser_click', () => {
  it('passes ref and optional element description', async () => {
    mockClick.mockResolvedValue({ url: 'https://x.test', snapshot: 'snap' });
    await browserClickTool({ ref: 'e3', element: 'Submit button' });
    expect(mockClick).toHaveBeenCalledWith('e3', 'Submit button');
  });

  it('returns a fresh snapshot after click', async () => {
    mockClick.mockResolvedValue({ url: 'https://x.test', snapshot: 'after' });
    const r = await browserClickTool({ ref: 'e3' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.contextEntries?.[0]?.content).toBe('after');
  });
});

describe('browser_type', () => {
  it('forwards submit flag', async () => {
    mockTypeText.mockResolvedValue({ url: 'https://x.test', snapshot: 's' });
    await browserTypeTool({ ref: 'e1', text: 'hello', submit: true });
    expect(mockTypeText).toHaveBeenCalledWith('e1', 'hello', undefined, {
      submit: true,
    });
  });
});

describe('browser_scroll', () => {
  it('scrolls down', async () => {
    mockScroll.mockResolvedValue({ url: 'https://x.test', snapshot: 's' });
    const r = await browserScrollTool({ direction: 'down' });
    expect(mockScroll).toHaveBeenCalledWith('down');
    expect(r.ok).toBe(true);
  });
});

describe('browser_snapshot', () => {
  it('returns current url + snapshot text', async () => {
    mockSnapshot.mockResolvedValue('- button "OK" [ref=e2]');
    mockGetCurrentUrl.mockReturnValue('https://current.test');
    const r = await browserSnapshotTool({});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.output).toContain('https://current.test');
      expect(r.contextEntries?.[0]?.type).toBe('browser-snapshot');
    }
  });
});

describe('browser_screenshot', () => {
  it('returns an image payload with data URL content', async () => {
    mockScreenshot.mockResolvedValue({
      mimeType: 'image/jpeg',
      base64: '/9j/4AAQ==',
      url: 'https://x.test',
    });
    const r = await browserScreenshotTool({});
    expect(r.ok).toBe(true);
    if (r.ok) {
      const e = r.contextEntries?.[0];
      expect(e?.type).toBe('image');
      expect(e?.mimeType).toBe('image/jpeg');
      expect(e?.base64).toBe('/9j/4AAQ==');
      expect(e?.url).toBe('https://x.test');
      expect(e?.content).toContain('data:image/jpeg;base64,');
    }
  });

  it('supports element-scoped screenshots via ref', async () => {
    mockScreenshot.mockResolvedValue({
      mimeType: 'image/png',
      base64: 'AAA==',
      url: 'https://x.test',
    });
    await browserScreenshotTool({ ref: 'e5', element: 'hero image' });
    expect(mockScreenshot).toHaveBeenCalledWith({ ref: 'e5', element: 'hero image' });
  });
});
