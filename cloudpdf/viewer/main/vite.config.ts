/**
 * Two build passes of one entry (see package.json's build script), the same split as the
 * open-source viewer's:
 *
 *   1. `vite build` — `dist/index.js`, the cloud door for a bundler (`.`). Every
 *      `@embedpdf/*` and `@cloudpdf/*` package stays an import, so the app has one
 *      `@embedpdf/viewer/core` (the element class the door registers its engine on, and the one
 *      each framework wrapper renders), and the local engine stamps load goes through the app's
 *      asset pipeline. Prebundling it would freeze its wasm URL against this package, and Vite
 *      lib mode would inline the 6 MB binary as base64.
 *
 *   2. `vite build --mode snippet` — `dist/cloudpdf.js` (`./snippet`), the finished CDN artifact:
 *      the same door with `@embedpdf/viewer/core` (Preact already compiled in) and the cloud
 *      engine bundled. Pages render on the server; the local engine is only a lazy chunk for
 *      stamps, and its wasm is emitted as `dist/embedpdf.wasm` next to it (through
 *      build/wasm-url-asset.js), so the folder is the unit of delivery.
 */
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  const snippet = mode === 'snippet';
  // One entry, two passes: `index.js` for a bundler, `cloudpdf.js` whole for a script tag.
  const entry: Record<string, string> = snippet
    ? { cloudpdf: 'src/index.ts' }
    : { index: 'src/index.ts' };
  return {
    resolve: {
      alias: snippet
        ? [
            {
              // The engine's default wasm location becomes an emitted asset
              // instead of 6 MB of base64. Anchored on the package dir: vite
              // executes this config from a .vite-temp copy.
              find: '@embedpdf/engine-runtime-wasm32/wasm-url',
              replacement: path.resolve(process.cwd(), 'build/wasm-url-asset.js'),
            },
          ]
        : [],
    },
    // Loaded straight from a CDN — no consumer bundler defines process.env.
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    // Relocatable: chunk URLs must resolve relative to cloudpdf.js itself.
    experimental: {
      renderBuiltUrl: () => ({ relative: true }),
    },
    build: {
      target: 'es2020',
      sourcemap: true,
      // The snippet pass adds to the first pass's dist (the build script
      // cleans dist first; chunk names are content-hashed, so no collisions).
      emptyOutDir: !snippet,
      lib: {
        entry,
        formats: ['es'] as const,
        fileName: (_format: string, entryName: string) => `${entryName}.js`,
      },
      rollupOptions: {
        // The npm pass leaves every package to the app's bundler, so the app has one
        // `@embedpdf/viewer/core` (one element class, the one this door registers on) and the
        // stamps' local engine goes through its asset pipeline.
        external: snippet ? undefined : (id: string) => /^@(embedpdf|cloudpdf)\//.test(id),
        // The snippet's one emitted asset keeps its plain name:
        // `dist/embedpdf.wasm`, next to `cloudpdf.js`.
        output: {
          chunkFileNames: 'chunks/[name]-[hash].js',
          ...(snippet ? { assetFileNames: '[name][extname]' } : {}),
        },
      },
    },
  };
});
