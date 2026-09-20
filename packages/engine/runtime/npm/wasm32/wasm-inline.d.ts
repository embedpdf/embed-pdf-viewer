/**
 * `lib/embedpdf.wasm` as a gzipped, base64-encoded string — the PORTABLE
 * delivery of the binary, through the module graph. Import it lazily
 * (`@embedpdf/engine/portable` does) and inflate with `DecompressionStream`.
 * Generated in the same build step as the binary; see build/generate-wasm-inline.mjs.
 */
declare const inline: string;
export default inline;
