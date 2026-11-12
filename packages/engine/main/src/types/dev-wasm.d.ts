/**
 * `@embedpdf/engine/dev-wasm`: `embedpdf.wasm` gzipped and base64-encoded, for a dev server
 * that prebundled the package without the file, or null. The export map decides which: the
 * `development` condition gives `workers/dev-wasm.js`, which passes on
 * `@embedpdf/engine-runtime-wasm32/wasm-inline`, and every other build gets
 * `workers/dev-wasm.none.js`, so a production build never carries the binary as a chunk
 * beside the file it emits. Both are written by `scripts/build-workers.mjs`. This declaration
 * lets the package typecheck before its own build has run.
 */
declare module '@embedpdf/engine/dev-wasm' {
  const packed: string | null;
  export default packed;
}
