export type SymbolKind = 'function' | 'class' | 'method' | 'variable';

export interface ParsedSymbol {
  name: string;
  kind: SymbolKind;
  signature: string;
  startLine: number;
}

export interface RankedSymbol {
  name: string;
  signature: string;
  rank: number;
}

export interface RankedFile {
  path: string;
  symbols: RankedSymbol[];
}

export interface RepoMapCacheData {
  commitHash: string;
  files: RankedFile[];
}
