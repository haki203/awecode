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

import Parser from 'web-tree-sitter';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import type { ParsedSymbol, SymbolKind } from './types.js';

type WebLanguage = Parser.Language;
type SyntaxNode = Parser.SyntaxNode;
type Tree = Parser.Tree;

const GRAMMAR_FILES: Record<string, string> = {
  '.ts': 'tree-sitter-typescript.wasm',
  '.tsx': 'tree-sitter-tsx.wasm',
  '.js': 'tree-sitter-javascript.wasm',
  '.jsx': 'tree-sitter-javascript.wasm',
  '.py': 'tree-sitter-python.wasm',
  '.go': 'tree-sitter-go.wasm',
  '.rs': 'tree-sitter-rust.wasm',
};

const SYMBOL_NODE_TYPES: Record<string, SymbolKind> = {
  function_declaration: 'function',
  function_definition: 'function',
  class_declaration: 'class',
  class_definition: 'class',
  method_definition: 'method',
  method_declaration: 'method',
};

let parserInitPromise: Promise<void> | null = null;
const languageCache = new Map<string, WebLanguage | null>();

async function ensureParserInit(): Promise<void> {
  if (!parserInitPromise) {
    parserInitPromise = Parser.init();
  }
  await parserInitPromise;
}

async function resolveWasmBytes(wasmFile: string): Promise<Buffer | null> {
  const candidates = [
    `node_modules/tree-sitter-wasms/out/${wasmFile}`,
    `../../node_modules/tree-sitter-wasms/out/${wasmFile}`,
    `../../../node_modules/tree-sitter-wasms/out/${wasmFile}`,
  ];
  for (const p of candidates) {
    try {
      return await readFile(p);
    } catch {
      // try next candidate
    }
  }
  return null;
}

async function getLanguage(ext: string): Promise<WebLanguage | null> {
  if (languageCache.has(ext)) {
    const cached = languageCache.get(ext);
    return cached === undefined ? null : cached;
  }
  const wasmFile = GRAMMAR_FILES[ext];
  if (!wasmFile) {
    languageCache.set(ext, null);
    return null;
  }

  const wasmBytes = await resolveWasmBytes(wasmFile);
  if (!wasmBytes) {
    languageCache.set(ext, null);
    return null;
  }

  await ensureParserInit();
  const lang = await Parser.Language.load(new Uint8Array(wasmBytes));
  languageCache.set(ext, lang);
  return lang;
}

export type ParseFileResult =
  | { symbols: ParsedSymbol[] }
  | { unsupported: true };

export async function parseFile(
  filePath: string,
  content: string,
): Promise<ParseFileResult> {
  const ext = extname(filePath);
  const lang = await getLanguage(ext);
  if (!lang) return { unsupported: true };

  await ensureParserInit();
  const parser = new Parser();
  parser.setLanguage(lang);
  const tree = parser.parse(content) as Tree | null;
  parser.delete();
  if (!tree) return { unsupported: true };

  const symbols: ParsedSymbol[] = [];
  walkTree(tree.rootNode, symbols);
  tree.delete();
  return { symbols };
}

function firstSignatureLine(node: SyntaxNode): string {
  const text = node.text;
  const braceIdx = text.indexOf('{');
  const head = braceIdx >= 0 ? text.slice(0, braceIdx) : text;
  const firstLine = head.split('\n')[0];
  return (firstLine ?? '').trim();
}

function emitSymbol(node: SyntaxNode, kind: SymbolKind, symbols: ParsedSymbol[]): void {
  const nameNode = node.childForFieldName('name');
  const name = nameNode?.text ?? '<anonymous>';
  symbols.push({
    name,
    kind,
    signature: firstSignatureLine(node),
    startLine: node.startPosition.row + 1,
  });
}

function walkTree(node: SyntaxNode, symbols: ParsedSymbol[]): void {
  const directKind = SYMBOL_NODE_TYPES[node.type];
  if (directKind) {
    emitSymbol(node, directKind, symbols);
    // Still descend so we capture methods inside classes, etc.
  }

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) walkTree(child, symbols);
  }
}
