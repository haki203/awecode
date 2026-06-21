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

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface DetectedTestCommand {
  command: string;
  reason: string;
}

export async function detectTestCommand(
  projectRoot: string,
): Promise<DetectedTestCommand | null> {
  // 1. Rust — Cargo.toml (preferred over Node when both exist, since a Cargo
  //    project at the repo root typically indicates the primary language).
  try {
    await readFile(join(projectRoot, 'Cargo.toml'));
    return { command: 'cargo test', reason: 'Cargo.toml exists' };
  } catch {
    // not rust
  }

  // 2. Node.js — package.json with non-empty scripts.test
  try {
    const pkgRaw = await readFile(join(projectRoot, 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgRaw) as { scripts?: { test?: string } };
    const testScript = pkg.scripts?.test;
    if (testScript && testScript.trim() !== '' && !testScript.includes('echo "no test"') && !testScript.includes('echo no test')) {
      let hasYarn = false;
      try {
        await readFile(join(projectRoot, 'yarn.lock'));
        hasYarn = true;
      } catch {
        // npm project
      }
      return {
        command: hasYarn ? 'yarn test' : 'npm test',
        reason: 'package.json scripts.test exists',
      };
    }
  } catch {
    // no package.json
  }

  // 3. Python — pytest.ini or pyproject.toml with [tool.pytest]
  try {
    await readFile(join(projectRoot, 'pytest.ini'));
    return { command: 'pytest', reason: 'pytest.ini exists' };
  } catch {
    // no pytest.ini
  }
  try {
    const pyproject = await readFile(join(projectRoot, 'pyproject.toml'), 'utf-8');
    if (pyproject.includes('[tool.pytest]') || pyproject.includes('[tool.pytest.ini_options]')) {
      return { command: 'pytest', reason: 'pyproject.toml has pytest config' };
    }
  } catch {
    // no pyproject
  }

  // 4. Go — go.mod
  try {
    await readFile(join(projectRoot, 'go.mod'));
    return { command: 'go test ./...', reason: 'go.mod exists' };
  } catch {
    // not go
  }

  // 5. Makefile with test target
  try {
    const makefile = await readFile(join(projectRoot, 'Makefile'), 'utf-8');
    if (/^test:/m.test(makefile)) {
      return { command: 'make test', reason: 'Makefile has test target' };
    }
  } catch {
    // no Makefile
  }

  return null;
}
