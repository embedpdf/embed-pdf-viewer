/**
 * The one place React becomes Preact. Everything above this build — the
 * chrome, the React adapter — is written against react/react-dom; this
 * config aliases the whole family to preact/compat, so the shipped artifact
 * carries no React and peers with nothing. Consumers (CDN scripts, framework
 * wrappers) load dist — they never compile the chrome themselves.
 *
 * Two build passes (see package.json's build script):
 *
 *   1. `vite build` — the npm entry (`dist/index.js`). The engine is
 *      externalized: it is pure TS (no react aliasing needed), and consumers'
 *      bundlers must process it themselves so the engine's bundler-resolved
 *      wasm default (`new URL('./lib/embedpdf.wasm', import.meta.url)` inside
 *      @embedpdf/engine-runtime-wasm32/wasm-url) lands in their asset
 *      pipeline — that is what makes <PDFViewer> zero-config in Next/Vite.
 *      Prebundling the engine would freeze that URL against this package
 *      instead, and Vite lib mode would inline the 6 MB binary as base64.
 *
 *   2. `vite build --mode snippet` — the CDN artifact (`dist/embedpdf.js`),
 *      fully self-contained: engine bundled, `embedpdf.wasm` emitted into
 *      dist by Vite from an explicit `?url&no-inline` asset import (the
 *      snippet door's own, and the engine's default via the alias below), so
 *      every chunk references it by a correct relative URL — the folder is
 *      the unit of delivery, from jsDelivr or an internal server alike. The
 *      engine's `embedpdf-worker.js` and `encoder-worker.js` land beside it
 *      the same way (build/worker-files.ts).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { shadowStylesheet } from './build/shadow-stylesheet';
import { workerFilesAsAssets } from './build/worker-files';

// Absolute file paths, resolved from this package: the react imports being
// aliased live in @embedpdf/viewer-chrome and @embedpdf/react, whose own
// node_modules have no preact (pnpm is strict) — a bare-specifier replacement
// would re-resolve from the importer and fail.
const preact = (specifier: string) => fileURLToPath(import.meta.resolve(specifier));

/** The packages this build compiles to Preact, so the consumer can't share them. */
const PREACT_COMPILED = /^@embedpdf\/(react|viewer-chrome)(\/|$)/;

/** A package the npm pass leaves to the consumer's bundler (see `rollupOptions.external`). */
const isSharedPackage = (id: string): boolean =>
  id.startsWith('@embedpdf/') && !PREACT_COMPILED.test(id);

export default defineConfig(({ mode }) => {
  const snippet = mode === 'snippet';
  // One entry per door (src/doors/*), keeping the historical output names:
  // the local door ships as index.js, the engine-agnostic one as core.js.
  const entry: Record<string, string> = snippet
    ? { embedpdf: 'src/doors/snippet.ts' }
    : { index: 'src/doors/local.ts', core: 'src/doors/core.ts' };
  return {
    // The snippet's folder carries the engine's worker files beside embedpdf.wasm
    // (build/worker-files.ts); the npm pass leaves them to the consumer's bundler.
    plugins: [tailwindcss(), ...(snippet ? [workerFilesAsAssets()] : [])],
    // Runs on Tailwind's output: the chrome's sheet, made to work inside the
    // element's shadow root (see build/shadow-stylesheet.ts).
    css: { postcss: { plugins: [shadowStylesheet()] } },
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
                // The engine's default wasm location becomes an emitted asset
                // (build/wasm-url-asset.js) instead of 6 MB of base64.
                // Anchored on the package dir: vite executes this config from
                // a .vite-temp copy, so import.meta-relative paths break.
                find: '@embedpdf/engine-runtime-wasm32/wasm-url',
                replacement: path.resolve(process.cwd(), 'build/wasm-url-asset.js'),
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
      // public/ is the dev harness's demo PDF — not part of the artifact.
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
        // npm pass only: every framework-free `@embedpdf/*` package stays a
        // bare import for the consumer's bundler — the engine (whose wasm and
        // worker files must land in the consumer's asset pipeline), core, the
        // plugins, `@embedpdf/web`, `@embedpdf/default-stamps/library`. The
        // consumer then loads ONE copy of each, shared with its own headless
        // adapter: capabilities are looked up by token identity, so a second
        // copy of a plugin would be a different plugin. Only the packages
        // compiled to Preact here stay inside: `@embedpdf/react` (the chrome's
        // copy, not the app's) and `@embedpdf/viewer-chrome`. The snippet pass
        // bundles everything: its folder is the unit of delivery.
        external: snippet ? undefined : isSharedPackage,
        // Chunks land in chunks/, imported relatively from the entry —
        // relocatable as a folder. The snippet's one emitted asset keeps its
        // plain name: `dist/embedpdf.wasm`, the documented sibling.
        output: {
          chunkFileNames: 'chunks/[name]-[hash].js',
          ...(snippet ? { assetFileNames: '[name][extname]' } : {}),
        },
      },
    },
    server: { port: 5230, strictPort: true },
  };
});
