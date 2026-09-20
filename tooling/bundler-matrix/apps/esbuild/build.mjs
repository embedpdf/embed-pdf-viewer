import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
await build({
  entryPoints: [process.env.MATRIX_ENTRY === 'portable' ? 'src/main.portable.js' : 'src/main.js'],
  bundle: true,
  format: 'esm',
  splitting: true,
  minify: true,
  outdir: 'dist',
  target: 'es2022',
  // What an esbuild user gets with no special handling of assets.
});
copyFileSync('index.html', 'dist/index.html');
if (process.env.MATRIX_ENTRY === 'portable') {
  // The page loads main.js; the portable build emits main.portable.js.
  copyFileSync('dist/main.portable.js', 'dist/main.js');
}
