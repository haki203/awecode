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

import { useEffect, useState } from 'react';
import type { WorkspaceState } from '../../../main/types.js';

/**
 * Desktop-only hook for multi-project state. Web does NOT import this.
 *
 * Calls the flat `window.awecode.workspace*` methods exposed by the Desktop
 * preload (see packages/gui/src/preload/index.ts), which in turn invoke the
 * `workspace:*` IPC handlers in packages/gui/src/main/index.ts. The global
 * `window.awecode` surface is typed via AwecodeApi (re-exported in
 * globals.d.ts), so any drift in the IPC contract surfaces as a typecheck
 * error here.
 */
export function useWorkspace() {
  const [state, setState] = useState<WorkspaceState>({ current: null, recent: [] });
  const [currentCwd, setCurrentCwd] = useState<string>('');

  useEffect(() => {
    void window.awecode.workspaceState().then(setState);
    void window.awecode.workspaceCurrent().then(setCurrentCwd);
  }, []);

  return {
    state,
    currentCwd,
    pickWorkspace: async () => {
      const cwd = await window.awecode.workspacePick();
      if (cwd) {
        const next = await window.awecode.workspaceOpen(cwd);
        setState(next);
        setCurrentCwd(cwd);
      }
    },
    switchWorkspace: async (cwd: string) => {
      const next = await window.awecode.workspaceOpen(cwd);
      setState(next);
      setCurrentCwd(cwd);
    },
  };
}
