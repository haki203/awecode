import { defineConfig } from 'tsup';

// Banner combines:
//   1. The Node ESM `require` shim — CJS deps bundled into the ESM output
//      (e.g. simple-git → @kwsites/file-exists) keep working under Node ESM.
//      See: https://github.com/egoist/tsup/discussions/505
//   2. The shebang — `packages/cli` is the bin entry (`awecode`).
//
// Order matters: shebang MUST be the very first line of the file so the
// kernel picks it up as an executable script. The `require` shim follows
// as an import statement on the next line.
const ESM_REQUIRE_SHIM = `import { createRequire as __createRequire } from 'module';const require = __createRequire(import.meta.url);`;

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  banner: {
    js: `#!/usr/bin/env node\n${ESM_REQUIRE_SHIM}`,
  },
});
