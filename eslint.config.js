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

// ESLint 10 flat config. The legacy `.eslintrc.cjs` format is no longer
// supported in ESLint 9+, so this file replaces it per the brief's guidance.
//
// `tseslint.configs['flat/recommended']` is an array containing:
//   1. A config object (files: *.ts) that turns OFF core ESLint rules which
//      conflict with TypeScript (e.g. `no-undef`).
//   2. A config object (files: *.ts) enabling `@typescript-eslint/recommended`.
//
// Spreading the array lets both apply, so ambient Node globals like `console`,
// `process`, and `NodeJS` don't trigger false-positive `no-undef` errors. We
// then tighten `no-unused-vars` (allow `_`-prefixed args) and `no-explicit-any`.
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.yarn/**', '**/coverage/**'],
  },
  js.configs.recommended,
  // Spread both config objects from flat/recommended (parser + rules).
  ...tseslint.configs['flat/recommended'],
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
];
