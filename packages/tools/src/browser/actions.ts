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

import type { Page } from 'playwright-core';
import { getBrowserSession } from './session.js';
import { captureSnapshot, refToLocator } from './snapshot.js';

export const DEFAULT_NAVIGATE_TIMEOUT_MS = 30_000;
const SCROLL_STEP_PX = 600;

interface ActionResult {
  url: string;
  snapshot?: string;
}

/** Wrap any action so we always return the current url + a fresh snapshot.
 * The post-action snapshot is always captured because click/type/scroll may
 * mutate the page; the perf win on the validation path comes from
 * refToLocator no longer re-snapshotting separately. */
async function withSnapshot(
  page: Page,
  action: () => Promise<void>,
): Promise<ActionResult> {
  await action();
  const url = page.url();
  const snapshot = await captureSnapshot(page);
  getBrowserSession().setCurrentUrl(url);
  return { url, snapshot };
}

export async function navigate(
  url: string,
  timeoutMs: number = DEFAULT_NAVIGATE_TIMEOUT_MS,
): Promise<ActionResult> {
  const page = getBrowserSession().getPage();
  return withSnapshot(page, async () => {
    await page.goto(url, { timeout: timeoutMs, waitUntil: 'domcontentloaded' });
  });
}

/**
 * Validate a URL is http(s) — shared by browser_navigate (and reusable by any
 * future browser action that accepts a URL). Throws on invalid scheme so the
 * tool handler can surface it as a ToolResult error.
 */
export function assertHttpUrl(url: string): void {
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
}

export async function click(
  ref: string,
  elementDescription?: string,
): Promise<ActionResult> {
  const page = getBrowserSession().getPage();
  const locator = await refToLocator(page, ref, elementDescription);
  return withSnapshot(page, async () => {
    await locator.click({ timeout: DEFAULT_NAVIGATE_TIMEOUT_MS });
  });
}

export async function typeText(
  ref: string,
  text: string,
  elementDescription?: string,
  opts: { submit?: boolean } = {},
): Promise<ActionResult> {
  const page = getBrowserSession().getPage();
  const locator = await refToLocator(page, ref, elementDescription);
  return withSnapshot(page, async () => {
    await locator.fill(text, { timeout: DEFAULT_NAVIGATE_TIMEOUT_MS });
    if (opts.submit) {
      await locator.press('Enter');
    }
  });
}

export async function scroll(direction: 'up' | 'down'): Promise<ActionResult> {
  const page = getBrowserSession().getPage();
  const delta = direction === 'down' ? SCROLL_STEP_PX : -SCROLL_STEP_PX;
  return withSnapshot(page, async () => {
    await page.mouse.wheel(0, delta);
    // Give SPAs a moment to render lazily-loaded content after scroll.
    await page.waitForTimeout(300);
  });
}

export async function snapshot(): Promise<string> {
  const page = getBrowserSession().getPage();
  return captureSnapshot(page);
}

export interface ScreenshotResult {
  mimeType: 'image/jpeg' | 'image/png';
  base64: string;
  url: string;
}

const SCREENSHOT_MAX_BYTES = 320_000; // spec cap: 320KB base64 (~240KB raw)

export async function screenshot(
  opts: { ref?: string; elementDescription?: string } = {},
): Promise<ScreenshotResult> {
  const session = getBrowserSession();
  const page = session.getPage();
  const url = page.url();

  // Playwright 1.61 screenshot `type` does not support webp. JPEG q80 is the
  // smallest lossy option and is universally supported by vision models; PNG
  // is the fallback for the rare pages whose JPEG encode fails.
  let mimeType: ScreenshotResult['mimeType'] = 'image/jpeg';
  let buf: Buffer | undefined;
  const capture = async (type: 'jpeg' | 'png'): Promise<Buffer> => {
    if (opts.ref) {
      const locator = await refToLocator(page, opts.ref, opts.elementDescription);
      return locator.screenshot(
        type === 'jpeg' ? { type, quality: 80 } : { type },
      );
    }
    return page.screenshot(type === 'jpeg' ? { type, quality: 80 } : { type });
  };
  try {
    buf = await capture('jpeg');
  } catch {
    mimeType = 'image/png';
    buf = await capture('png');
  }

  let base64 = buf.toString('base64');
  if (base64.length > SCREENSHOT_MAX_BYTES) {
    // Downscale the viewport and re-capture rather than truncating, which
    // would corrupt the image. We shrink to 70% which typically halves bytes.
    // Re-capture as JPEG (smaller) so the downscale actually helps; PNG would
    // usually be larger than the original JPEG and defeat the cap.
    const vp = session.getViewport();
    await page.setViewportSize({
      width: Math.round(vp.width * 0.7),
      height: Math.round(vp.height * 0.7),
    });
    try {
      base64 = (await capture('jpeg')).toString('base64');
      mimeType = 'image/jpeg';
    } catch {
      base64 = (await capture('png')).toString('base64');
      mimeType = 'image/png';
    }
    await page.setViewportSize(vp);
  }

  return { mimeType, base64, url };
}
