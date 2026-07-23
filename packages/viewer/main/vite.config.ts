/**
 * The ONE place React becomes Preact. Everything above this build — the
 * chrome, the React adapter — is written against react/react-dom; this
 * config aliases the whole family to preact/compat, so the shipped artifact
 * carries no React and peers with nothing. Consumers (CDN scripts, framework
 * wrappers) load dist — they never compile the chrome themselves.
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// Absolute file paths, resolved from THIS package: the react imports being
// aliased live in @embedpdf/viewer-chrome and @embedpdf/react, whose own
// node_modules have no preact (pnpm is strict) — a bare-specifier replacement
// would re-resolve from the importer and fail.
const preact = (specifier: string) => fileURLToPath(import.meta.resolve(specifier));

export default defineConfig({
  plugins: [tailwindcss()],
  resolve: {
    alias: [
      { find: 'react-dom/client', replacement: preact('preact/compat/client') },
      { find: 'react-dom', replacement: preact('preact/compat') },
      { find: 'react/jsx-runtime', replacement: preact('preact/jsx-runtime') },
      { find: 'react/jsx-dev-runtime', replacement: preact('preact/jsx-dev-runtime') },
      { find: /^react$/, replacement: preact('preact/compat') },
    ],
  },
  // The artifact is a finished product loaded straight from a CDN: no consumer
  // bundler will define process.env for it. Config-mistake warnings stay on —
  // the element validates unconditionally (see element.ts).
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  worker: { format: 'es' },
  // The artifact must be relocatable — served from any CDN directory. Without
  // this, worker/wasm asset URLs resolve base-absolute ('/assets/…') and break
  // anywhere but the site root.
  experimental: {
    renderBuiltUrl: () => ({ relative: true }),
  },
  build: {
    target: 'es2020',
    sourcemap: true,
    // public/ is the DEV harness's demo PDF — not part of the artifact.
    copyPublicDir: false,
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'embedpdf.js',
    },
  },
  server: { port: 5230, strictPort: true },
});
