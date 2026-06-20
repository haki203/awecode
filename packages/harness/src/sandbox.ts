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

import { platform } from 'node:os';

export interface NetworkIsolationHandle {
  cleanup: () => Promise<void>;
}

/**
 * Enable network isolation for a child process.
 *
 * v0.1: Stub implementation. Real implementation deferred.
 * Returns null with warning — git worktree provides basic isolation,
 * but no network blocking. See spec section 5.4 for future plan.
 */
export async function enableNetworkIsolation(
  pid: number,
): Promise<NetworkIsolationHandle | null> {
  const p = platform();
  const platformName =
    p === 'win32' ? 'Windows' : p === 'darwin' ? 'macOS' : 'Linux';

  console.warn(
    `[awecode] Network isolation not yet implemented on ${platformName}. ` +
      `Using git worktree isolation only (no network blocking).`,
  );
  return null;
}
