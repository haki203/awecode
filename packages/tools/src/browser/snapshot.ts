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

const MAX_SNAPSHOT_CHARS = 30_000;

/**
 * Capture the page's accessibility tree as YAML with element refs.
 *
 * Uses Playwright's `ariaSnapshot({ mode: 'ai' })` (public since v1.49, ref
 * emission since v1.59). Interactive elements get refs like `[ref=e2]` that
 * the LLM passes to browser_click / browser_type. Refs are stable only until
 * the next navigation — action tools detect stale refs and report clearly.
 *
 * The snapshot is capped at MAX_SNAPSHOT_CHARS; if a page is huge, depth is
 * progressively limited to stay under the cap rather than truncating mid-node.
 */
export async function captureSnapshot(
  page: Page,
  opts: { depth?: number } = {},
): Promise<string> {
  // Try full first; if over cap, retry with shallower depth.
  for (const depth of [opts.depth, 8, 5, 3]) {
    if (depth === undefined) continue;
    const snap = await page.ariaSnapshot({ mode: 'ai', depth });
    if (snap.length <= MAX_SNAPSHOT_CHARS) return snap;
  }
  // Last resort: full snapshot with tail truncation.
  const snap = await page.ariaSnapshot({ mode: 'ai' });
  if (snap.length <= MAX_SNAPSHOT_CHARS) return snap;
  return (
    snap.slice(0, MAX_SNAPSHOT_CHARS) +
    `\n\n[truncated: showing first ${MAX_SNAPSHOT_CHARS} of ${snap.length} characters — narrow scope with browser_snapshot on a specific element]`
  );
}

/**
 * Resolve an LLM-provided ref (e.g. "e2") to a Playwright Locator.
 *
 * Uses the `aria-ref=<ref>` selector convention. This selector is internal to
 * Playwright but is the exact mechanism the official @playwright/mcp server
 * uses to resolve refs, and has been stable across v1.49–v1.61+. We validate
 * against the latest snapshot first so stale refs produce an actionable error
 * instead of a silent wait/timeout.
 *
 * NOTE: the substring-include staleness check is UX, not a security boundary
 * — a malicious page could embed "[ref=e2]" text to make the check pass for a
 * ref that doesn't resolve to a real element; Playwright's locator lookup
 * would then throw a strict-mode/timeout error, which is the worst outcome.
 */
export async function refToLocator(
  page: Page,
  ref: string,
  elementDescription?: string,
): Promise<ReturnType<Page['locator']>> {
  const currentSnap = await page.ariaSnapshot({ mode: 'ai' });
  if (!currentSnap.includes(`[ref=${ref}]`)) {
    throw new Error(
      `Ref "${ref}" not found in the current page snapshot. The page may have navigated or changed since the snapshot was taken. Call browser_snapshot to get fresh refs.`,
    );
  }
  const locator = page.locator(`aria-ref=${ref}`);
  // `.describe()` annotates the locator with a human-readable label that
  // surfaces in errors and traces without changing what it matches.
  return elementDescription ? locator.describe(elementDescription) : locator;
}
