---
'@embedpdf/engine-runtime-wasm32': minor
---

New `@embedpdf/engine-runtime-wasm32/wasm-inline`: `embedpdf.wasm` as a gzipped, base64 ES module (about 3.6 MB on disk, the same bytes as the file over the wire), generated in the same build step as the binary. This is what `@embedpdf/engine/portable` imports lazily so the wasm can travel through the module graph where a bundler cannot emit it as an asset.
