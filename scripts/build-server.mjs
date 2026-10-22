// Bundles the Hono server (and the shared domain code it imports) into a single ESM file.
// npm packages stay external and are resolved from node_modules at runtime.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/server/index.ts'],
  outfile: 'dist/server/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  packages: 'external',
  tsconfig: 'tsconfig.node.json',
  sourcemap: true,
  logLevel: 'info',
});
