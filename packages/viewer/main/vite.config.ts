/**
 * The ONE place React becomes Preact. Everything above this build — the
 * chrome, the React adapter — is written against react/react-dom; this
 * config aliases the whole family to preact/compat, so the shipped artifact
 * carries no React and peers with nothing. Consumers (CDN scripts, framework
 * wrappers) load dist — they never compile the chrome themselves.
 *
 * TWO BUILD PASSES (see package.json's build script):
 *
 *   1. `vite build` — the npm entry (`dist/index.js`). The engine is
 *      EXTERNALIZED: it is pure TS (no react aliasing needed), and consumers'
 *      bundlers must process it themselves so the engine's bundler-resolved
 *      wasm default (`new URL('./lib/pdfium.wasm', import.meta.url)` inside
 *      @embedpdf/engine-runtime-wasm32/wasm-url) lands in THEIR asset
 *      pipeline — that is what makes <PDFViewer> zero-config in Next/Vite.
 *      Prebundling the engine would freeze that URL against this package
 *      instead, and Vite lib mode would inline the 6 MB binary as base64.
 *
 *   2. `vite build --mode snippet` — the CDN artifact (`dist/embedpdf.js`),
 *      fully self-contained: engine bundled, `pdfium.wasm` copied to dist as
 *      the snippet's self-located sibling (src/snippet.ts), and the engine's
 *      wasm-url module stubbed out (the snippet never consults the default,
 *      and the stub keeps the binary out of the JS).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type PluginOption } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// Absolute file paths, resolved from THIS package: the react imports being
// aliased live in @embedpdf/viewer-chrome and @embedpdf/react, whose own
// node_modules have no preact (pnpm is strict) — a bare-specifier replacement
// would re-resolve from the importer and fail.
const preact = (specifier: string) => fileURLToPath(import.meta.resolve(specifier));

// The snippet artifact carries its own pdfium.wasm at the dist root: the
// snippet entry defaults to this SIBLING (self-locating — see src/snippet.ts),
// which is what makes air-gapping the snippet "copy the folder". Copied
// verbatim from the exact wasm32 package this build resolves.
const copyPdfiumWasm = (): PluginOption => ({
  name: 'copy-pdfium-wasm',
  apply: 'build',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'pdfium.wasm',
      source: fs.readFileSync(
        fileURLToPath(import.meta.resolve('@embedpdf/engine-runtime-wasm32/pdfium.wasm')),
      ),
    });
  },
});

export default defineConfig(({ mode }) => {
  const snippet = mode === 'snippet';
  // One entry per DOOR (src/doors/*), keeping the historical output names:
  // the local door ships as index.js, the engine-agnostic one as core.js.
  const entry: Record<string, string> = snippet
    ? { embedpdf: 'src/doors/snippet.ts' }
    : { index: 'src/doors/local.ts', core: 'src/doors/core.ts' };
  return {
    plugins: [tailwindcss(), ...(snippet ? [copyPdfiumWasm()] : [])],
    resolve: {
      alias: [
        { find: 'react-dom/client', replacement: preact('preact/compat/client') },
        { find: 'react-dom', replacement: preact('preact/compat') },
        { find: 'react/jsx-runtime', replacement: preact('preact/jsx-runtime') },
        { find: 'react/jsx-dev-runtime', replacement: preact('preact/jsx-dev-runtime') },
        { find: /^react$/, replacement: preact('preact/compat') },
        ...(snippet
          ? [
              {
                find: '@embedpdf/engine-runtime-wasm32/wasm-url',
                // Anchored on the package dir: vite executes this config from
                // a .vite-temp copy, so import.meta-relative paths break.
                replacement: path.resolve(process.cwd(), 'build/wasm-url-stub.js'),
              },
            ]
          : []),
      ],
    },
    // The artifact is a finished product loaded straight from a CDN: no consumer
    // bundler will define process.env for it. Config-mistake warnings stay on —
    // the element validates unconditionally (see element.ts).
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    // The artifact must be relocatable — served from any CDN directory. Without
    // this, chunk URLs resolve base-absolute ('/assets/…') and break anywhere
    // but the site root.
    experimental: {
      renderBuiltUrl: () => ({ relative: true }),
    },
    build: {
      target: 'es2020',
      sourcemap: true,
      // public/ is the DEV harness's demo PDF — not part of the artifact.
      copyPublicDir: false,
      // The snippet pass adds to the npm pass's dist (the build script cleans
      // dist first; chunk names are content-hashed, so no collisions).
      emptyOutDir: !snippet,
      lib: {
        entry,
        formats: ['es'] as const,
        fileName: (_format: string, entryName: string) => `${entryName}.js`,
      },
      rollupOptions: {
        // npm pass only: the engine (and its lazily-imported worker-source
        // module) stays a bare import for the consumer's bundler to process.
        external: snippet
          ? undefined
          : (id: string) => id === '@embedpdf/engine' || id.startsWith('@embedpdf/engine/'),
        // Chunks land in chunks/, imported RELATIVELY from the entry —
        // relocatable as a folder.
        output: { chunkFileNames: 'chunks/[name]-[hash].js' },
      },
    },
    server: { port: 5230, strictPort: true },
  };
});
