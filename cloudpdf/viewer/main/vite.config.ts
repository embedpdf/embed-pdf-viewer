/**
 * Two build passes (see package.json's build script), the same split as the
 * open-source viewer's:
 *
 *   1. `vite build` — `dist/config.js`, the framework-free cloud vocabulary
 *      that every @cloudpdf/viewer-<framework> wrapper imports. The local
 *      engine stays a bare import: it is loaded only when someone opens
 *      Stamps or Signatures, and the consumer's bundler must process it so the
 *      engine's bundler-resolved wasm default lands in their asset pipeline.
 *      Prebundling it would freeze that URL against this package, and Vite
 *      lib mode would inline the 6 MB binary as base64.
 *
 *   2. `vite build --mode snippet` — `dist/cloudpdf.js`, the finished CDN
 *      artifact. It bundles `@embedpdf/viewer/core` (the engine-agnostic
 *      entry, Preact already compiled in) plus the cloud engine. Pages render
 *      on the server; the local engine is only a lazy chunk for stamps, and
 *      its wasm is emitted as `dist/embedpdf.wasm` next to it (through
 *      build/wasm-url-asset.js), so the folder is the unit of delivery.
 */
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  const snippet = mode === 'snippet';
  const entry: Record<string, string> = snippet
    ? { cloudpdf: 'src/index.ts' }
    : { config: 'src/config.ts' };
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
        external: snippet
          ? undefined
          : (id: string) => id === '@embedpdf/engine' || id.startsWith('@embedpdf/engine/'),
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
