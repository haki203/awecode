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

export interface Viewport {
  width: number;
  height: number;
}

// Default viewport mirrors Cline's BrowserSettings (small to keep screenshots
// cheap in tokens). LLMs can pass a preset name to browser_session_open.
export const DEFAULT_VIEWPORT: Viewport = { width: 900, height: 600 };

export const VIEWPORT_PRESETS: Record<string, Viewport> = {
  desktop: { width: 1280, height: 800 },
  'small-desktop': { width: 900, height: 600 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 360, height: 640 },
};

/**
 * Resolve a viewport preset name to a {width,height}. Returns the default
 * viewport if `name` is missing or unrecognised; the second element of the
 * returned tuple signals whether the preset was found so callers can warn the
 * LLM about typos (e.g. "mobil" → used default instead of mobile).
 */
export function resolveViewport(
  name?: string,
): Viewport & { recognised: boolean } {
  if (!name) return { ...DEFAULT_VIEWPORT, recognised: true };
  const v = VIEWPORT_PRESETS[name];
  if (v) return { ...v, recognised: true };
  return { ...DEFAULT_VIEWPORT, recognised: false };
}
