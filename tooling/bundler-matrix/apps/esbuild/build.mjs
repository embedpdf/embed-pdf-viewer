import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';

// MATRIX_ENTRY picks the page: the engine probe (none), the same probe through
// `@embedpdf/engine/portable` ('portable'), or the whole viewer through
// `@embedpdf/viewer/portable` ('viewer'), each from src/main[.<entry>].js.
const entry = process.env.MATRIX_ENTRY;

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
await build({
  entryPoints: [entry ? `src/main.${entry}.js` : 'src/main.js'],
  bundle: true,
  format: 'esm',
  splitting: true,
  minify: true,
  outdir: 'dist',
  target: 'es2022',
  // What an esbuild user gets with no special handling of assets.
});
if (entry === 'viewer') {
  // The viewer's page loads main.viewer.js, sizes #viewer from its stylesheet, and opens a PDF
  // served beside it.
  copyFileSync('index.viewer.html', 'dist/index.html');
  copyFileSync('viewer.css', 'dist/viewer.css');
  copyFileSync(
    new URL('../../../../examples/engine-runtime-demo/public/sample.pdf', import.meta.url),
    'dist/sample.pdf',
  );
} else {
  copyFileSync('index.html', 'dist/index.html');
  // The page loads main.js; the portable build emits main.portable.js.
  if (entry === 'portable') copyFileSync('dist/main.portable.js', 'dist/main.js');
}
