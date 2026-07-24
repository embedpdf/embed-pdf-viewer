/**
 * Aliased in place of `@embedpdf/engine-runtime-wasm32/wasm-url` in BUNDLED
 * artifacts (the snippet pass here, the cloud snippet in ee/viewer).
 *
 * Vite's library mode inlines `new URL(..., import.meta.url)` assets as
 * base64 — 6 MB of wasm inside a JS chunk. These artifacts provide their own
 * explicit wasm source (the snippet self-locates a dist sibling), so the
 * bundler-default module is never consulted; the engine treats a non-string
 * export like a missing module (CDN primary) if it ever were.
 */
export default undefined;
