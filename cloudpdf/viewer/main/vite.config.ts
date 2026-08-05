/**
 * cloudpdf.js — a finished CDN artifact, like the open snippet's embedpdf.js.
 * It bundles `@embedpdf/viewer/core` (the engine-agnostic entry, Preact
 * already compiled in) plus the cloud engine. The core entry registers no
 * default engine, so the local PDFium engine — the 6 MB wasm, the ~570 KB
 * worker source, the main-thread recipe — is structurally absent from this
 * bundle; nothing needs to be stubbed or aliased away.
 */
import { defineConfig } from 'vite';

export default defineConfig({
  // Loaded straight from a CDN — no consumer bundler defines process.env.
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  // Relocatable: chunk URLs must resolve relative to cloudpdf.js itself.
  experimental: {
    renderBuiltUrl: () => ({ relative: true }),
  },
  build: {
    target: 'es2020',
    sourcemap: true,
    lib: {
      // Two entries: the CDN artifact, and the framework-free cloud vocabulary
      // that every @cloudpdf/viewer-<framework> wrapper imports (./config).
      entry: { cloudpdf: 'src/index.ts', config: 'src/config.ts' },
      formats: ['es'],
      fileName: (_format: string, entryName: string) => `${entryName}.js`,
    },
    rollupOptions: {
      output: { chunkFileNames: 'chunks/[name]-[hash].js' },
    },
  },
});
