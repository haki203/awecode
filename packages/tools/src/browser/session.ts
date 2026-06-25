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

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { resolveViewport, type Viewport } from './viewport.js';

/**
 * Persistent Chromium session manager.
 *
 * One Chromium process lives across all browser_session_* calls between
 * open() and close(). This avoids paying ~300-800ms launch + ~150MB RAM on
 * every action. The agent layer is responsible for calling dispose() when a
 * ProtocolSession ends so we don't leak Chromium processes.
 *
 * Refs produced by snapshot() are valid only until the next navigation; the
 * action tools detect stale refs and surface a clear error.
 */
export class BrowserSession {
  private browser: Browser | undefined;
  private context: BrowserContext | undefined;
  private page: Page | undefined;
  private viewport: Viewport;
  private viewportRecognised: boolean;
  private currentUrl: string = '';

  constructor(viewport?: Viewport | string) {
    if (typeof viewport === 'string') {
      const r = resolveViewport(viewport);
      this.viewport = { width: r.width, height: r.height };
      this.viewportRecognised = r.recognised;
    } else {
      this.viewport = viewport ?? { ...resolveViewport() };
      this.viewportRecognised = true;
    }
  }

  get isOpen(): boolean {
    return this.browser !== undefined && this.page !== undefined;
  }

  getPage(): Page {
    if (!this.page) {
      throw new Error(
        'Browser session is not open. Call browser_session_open first, or the session was closed by a non-browser tool.',
      );
    }
    return this.page;
  }

  getViewport(): Viewport {
    return this.viewport;
  }

  /** True if the requested viewport preset name was found; false if it fell
   * back to the default (i.e. the LLM passed a typo). */
  isViewportRecognised(): boolean {
    return this.viewportRecognised;
  }

  getCurrentUrl(): string {
    return this.currentUrl;
  }

  setCurrentUrl(url: string): void {
    this.currentUrl = url;
  }

  async open(): Promise<void> {
    if (this.isOpen) return;
    // Wrap the launch→context→page chain so a failure at any step still closes
    // the partially-constructed browser — otherwise this.browser would stay
    // assigned while isOpen returns false, and a retry would launch a second
    // Chromium, orphaning the first.
    try {
      this.browser = await chromium.launch({ headless: true });
      this.context = await this.browser.newContext({
        viewport: this.viewport,
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      });
      this.page = await this.context.newPage();
    } catch (err) {
      await this.close();
      throw err;
    }
  }

  async close(): Promise<void> {
    try {
      await this.page?.close().catch(() => {});
      await this.context?.close().catch(() => {});
    } finally {
      await this.browser?.close().catch(() => {});
    }
    this.browser = undefined;
    this.context = undefined;
    this.page = undefined;
    this.currentUrl = '';
  }

  async dispose(): Promise<void> {
    await this.close();
  }
}

/**
 * Process-wide singleton so all browser_session_* tool calls share one Chromium.
 * The agent layer should call disposeBrowserSession() when a session ends.
 */
let globalSession: BrowserSession | undefined;

export function getBrowserSession(): BrowserSession {
  if (!globalSession) {
    throw new Error(
      'Browser session is not open. Call browser_session_open first.',
    );
  }
  return globalSession;
}

export function setBrowserSession(session: BrowserSession | undefined): void {
  globalSession = session;
}

export async function disposeBrowserSession(): Promise<void> {
  if (globalSession) {
    await globalSession.dispose();
    globalSession = undefined;
  }
}
