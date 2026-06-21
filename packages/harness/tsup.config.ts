import { defineConfig } from 'tsup';

// Banner injects a `require` shim so CJS deps bundled into the ESM output
// (e.g. simple-git → @kwsites/file-exists) keep working under Node ESM.
// See: https://github.com/egoist/tsup/discussions/505
const ESM_REQUIRE_SHIM = `import { createRequire as __createRequire } from 'module';const require = __createRequire(import.meta.url);`;

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  dts: true,
  banner: { js: ESM_REQUIRE_SHIM },
});
