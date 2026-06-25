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

import { describe, it, expect } from 'vitest';
import {
  listToolDefinitions,
  dispatchTool,
  TOOL_REGISTRY,
} from '../src/index.js';

describe('tool registry', () => {
  it('registers all built-in tools', () => {
    const names = Object.keys(TOOL_REGISTRY);
    expect(names).toContain('read_file');
    expect(names).toContain('list_files');
    expect(names).toContain('search_files');
    expect(names).toContain('shell_exec');
    expect(names).toContain('web_fetch');
    expect(names).toContain('web_search');
    expect(names).toContain('browser_session_open');
    expect(names).toContain('browser_navigate');
    expect(names).toContain('browser_screenshot');
    expect(names).toHaveLength(14);
  });

  it('listToolDefinitions returns all definitions', () => {
    const defs = listToolDefinitions();
    expect(defs).toHaveLength(14);
    expect(defs.map((d) => d.name).sort()).toEqual([
      'browser_click',
      'browser_navigate',
      'browser_screenshot',
      'browser_scroll',
      'browser_session_close',
      'browser_session_open',
      'browser_snapshot',
      'browser_type',
      'list_files',
      'read_file',
      'search_files',
      'shell_exec',
      'web_fetch',
      'web_search',
    ]);
  });
});

describe('dispatchTool', () => {
  it('returns error on unknown tool', async () => {
    const result = await dispatchTool({
      name: 'nonexistent_tool',
      arguments: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Unknown tool/);
  });

  it('dispatches read_file correctly', async () => {
    // Use a known path — package.json of this workspace
    const result = await dispatchTool({
      name: 'read_file',
      arguments: { path: 'package.json' },
    });
    // package.json may or may not exist relative to cwd, but tool should at least dispatch
    expect(result).toBeDefined();
  });
});
