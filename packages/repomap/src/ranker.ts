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

import type { ParsedSymbol, RankedFile, RankedSymbol } from './types.js';

export interface RankerOptions {
  tokenBudget?: number;
  maxIterations?: number;
  dampingFactor?: number;
}

const DEFAULT_OPTIONS: Required<RankerOptions> = {
  tokenBudget: 1024,
  maxIterations: 20,
  dampingFactor: 0.85,
};

export function rankSymbols(
  files: Map<string, ParsedSymbol[]>,
  options: RankerOptions = {},
): RankedFile[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const result: RankedFile[] = [];

  // v0.1 simple ranker: count references across all files
  const allSymbols: string[] = [];
  for (const symbols of files.values()) {
    for (const sym of symbols) {
      allSymbols.push(sym.name);
    }
  }

  const refCount = new Map<string, number>();
  for (const name of allSymbols) {
    refCount.set(name, (refCount.get(name) ?? 0) + 1);
  }

  const maxCount = Math.max(...refCount.values(), 1);

  for (const [path, symbols] of files.entries()) {
    const rankedSymbols: RankedSymbol[] = symbols.map((sym) => {
      const count = refCount.get(sym.name) ?? 1;
      const rawRank = count / maxCount;
      const rank = opts.dampingFactor * rawRank + (1 - opts.dampingFactor) / Math.max(allSymbols.length, 1);
      return {
        name: sym.name,
        signature: sym.signature,
        rank,
      };
    });

    rankedSymbols.sort((a, b) => b.rank - a.rank);

    result.push({ path, symbols: rankedSymbols });
  }

  return result;
}
