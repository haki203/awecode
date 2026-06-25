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

export type {
  ToolDefinition,
  ToolCall,
  ToolResult,
  ContextEntryPayload,
} from './types.js';

export { readFileTool, readFileDef } from './file/read.js';
export type { ReadFileArgs } from './file/read.js';
export { listFilesTool, listFilesDef } from './file/list.js';
export type { ListFilesArgs } from './file/list.js';
export { searchFilesTool, searchFilesDef } from './file/search.js';
export type { SearchFilesArgs } from './file/search.js';
export { shellExecTool, shellExecDef } from './shell/exec.js';
export type { ShellExecArgs } from './shell/exec.js';
export { webFetchTool, webFetchDef } from './web/fetch.js';
export type { WebFetchArgs } from './web/fetch.js';
export {
  browserSessionOpenTool,
  browserSessionCloseTool,
  browserNavigateTool,
  browserClickTool,
  browserTypeTool,
  browserScrollTool,
  browserSnapshotTool,
  browserScreenshotTool,
  browserSessionOpenDef,
  browserSessionCloseDef,
  browserNavigateDef,
  browserClickDef,
  browserTypeDef,
  browserScrollDef,
  browserSnapshotDef,
  browserScreenshotDef,
} from './browser/tools.js';
export type {
  BrowserSessionOpenArgs,
  BrowserSessionCloseArgs,
  BrowserNavigateArgs,
  BrowserClickArgs,
  BrowserTypeArgs,
  BrowserScrollArgs,
  BrowserSnapshotArgs,
  BrowserScreenshotArgs,
} from './browser/tools.js';
// BrowserSession + dispose helpers are exported for the agent layer to own
// the Chromium lifecycle (open on first browser tool, dispose on session end).
// Internal helpers like setBrowserSession / BROWSER_TOOL_HANDLERS are NOT
// re-exported — they are an implementation detail of the tool registry.
export { BrowserSession, disposeBrowserSession } from './browser/session.js';
export { resolveViewport, VIEWPORT_PRESETS, DEFAULT_VIEWPORT } from './browser/viewport.js';
export type { Viewport } from './browser/viewport.js';

import type { ToolDefinition, ToolCall, ToolResult } from './types.js';
import { readFileTool, readFileDef } from './file/read.js';
import type { ReadFileArgs } from './file/read.js';
import { listFilesTool, listFilesDef } from './file/list.js';
import type { ListFilesArgs } from './file/list.js';
import { searchFilesTool, searchFilesDef } from './file/search.js';
import type { SearchFilesArgs } from './file/search.js';
import { shellExecTool, shellExecDef } from './shell/exec.js';
import type { ShellExecArgs } from './shell/exec.js';
import { webFetchTool, webFetchDef } from './web/fetch.js';
import type { WebFetchArgs } from './web/fetch.js';
import {
  browserSessionOpenDef,
  browserSessionCloseDef,
  browserNavigateDef,
  browserClickDef,
  browserTypeDef,
  browserScrollDef,
  browserSnapshotDef,
  browserScreenshotDef,
  BROWSER_TOOL_HANDLERS,
} from './browser/tools.js';

const browserRegistryEntries: Record<string, { def: ToolDefinition; handler: ToolHandler }> =
  {};
for (const def of [
  browserSessionOpenDef,
  browserSessionCloseDef,
  browserNavigateDef,
  browserClickDef,
  browserTypeDef,
  browserScrollDef,
  browserSnapshotDef,
  browserScreenshotDef,
]) {
  browserRegistryEntries[def.name] = {
    def,
    handler: BROWSER_TOOL_HANDLERS[def.name]!,
  };
}

/**
 * Generic shape every tool handler satisfies at the dispatcher boundary.
 * Tools own a stricter, specific args type internally; the dispatcher hands
 * them an unvalidated record (matching `ToolCall.arguments`). Validation of
 * individual fields is the tool's responsibility.
 */
type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

/**
 * Type-safe adapter that lifts a tool with a specific args type into the
 * generic `ToolHandler` shape. The cast is confined to this single helper:
 * callers pass concrete `(args: FooArgs) => Promise<ToolResult>` functions
 * and get a `ToolHandler` back, so the registry never sees `any`. The input
 * record is passed straight through — tools read only the fields they
 * declare and ignore the rest — so no runtime coercion is needed.
 *
 * `A` is constrained to `object` rather than `Record<string, unknown>`
 * because the tool arg interfaces (e.g. `ReadFileArgs`) don't declare an
 * index signature; `object` accepts them while still forbidding primitives.
 */
function adaptToolHandler<A extends object>(
  handler: (args: A) => Promise<ToolResult>,
): ToolHandler {
  return (args: Record<string, unknown>) => handler(args as A);
}

export const TOOL_REGISTRY: Record<
  string,
  { def: ToolDefinition; handler: ToolHandler }
> = {
  [readFileDef.name]: {
    def: readFileDef,
    handler: adaptToolHandler<ReadFileArgs>(readFileTool),
  },
  [listFilesDef.name]: {
    def: listFilesDef,
    handler: adaptToolHandler<ListFilesArgs>(listFilesTool),
  },
  [searchFilesDef.name]: {
    def: searchFilesDef,
    handler: adaptToolHandler<SearchFilesArgs>(searchFilesTool),
  },
  [shellExecDef.name]: {
    def: shellExecDef,
    handler: adaptToolHandler<ShellExecArgs>(shellExecTool),
  },
  [webFetchDef.name]: {
    def: webFetchDef,
    handler: adaptToolHandler<WebFetchArgs>(webFetchTool),
  },
  ...browserRegistryEntries,
};

export function listToolDefinitions(): ToolDefinition[] {
  return Object.values(TOOL_REGISTRY).map((t) => t.def);
}

export async function dispatchTool(call: ToolCall): Promise<ToolResult> {
  const entry = TOOL_REGISTRY[call.name];
  if (!entry) {
    return { ok: false, error: `Unknown tool: ${call.name}` };
  }
  return entry.handler(call.arguments);
}

export const TOOLS_PACKAGE_VERSION = '0.0.0';
