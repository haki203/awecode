import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  dts: true,
  // @awecode/orchestrator depends on @awecode/agent (the reverse of the
  // dynamic import in protocol-session.ts). We load it via dynamic import
  // to avoid a static workspace cycle. Marking it external stops esbuild
  // from trying to inline orchestrator's dist (which pulls in Node built-ins
  // like readline/promises that esbuild can't resolve). The dependency is
  // resolved at runtime via the workspace symlink. See ADR-0007.
  external: ['@awecode/orchestrator'],
});
