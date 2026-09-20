/**
 * Aliased in place of `@embedpdf/engine-runtime-wasm32/wasm-url` in the
 * SNIPPET pass. The engine's default wasm location is a bundler-resolved
 * `new URL('./lib/embedpdf.wasm', import.meta.url)`; Vite's library mode
 * would inline that as 6 MB of base64, so the snippet routes it through an
 * explicit asset import instead. `?no-inline` makes Vite EMIT the file
 * (`dist/embedpdf.wasm`) and hand back a URL relative to whichever chunk
 * holds the reference — the same asset the snippet door itself uses.
 */
export { default } from '@embedpdf/engine-runtime-wasm32/embedpdf.wasm?url&no-inline';
