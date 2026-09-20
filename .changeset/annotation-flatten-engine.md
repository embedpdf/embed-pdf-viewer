---
'@embedpdf/engine': minor
---

The local engine implements `page(pon).annotations.flatten` (gated like `pages.flatten`, publishes `annotations.flattened`) and `page(pon).annotations.exportAppearance` (gated by `doc.download` like `pages.extract`).

It also implements `pages.setName` and `pages.removeName`: register, rename, or remove a `/Names /Pages` entry as a page-structure mutation gated by `doc.pages.assemble`, with the fresh layout returned and a `pages.named` event published. `pages.list()` includes `namedPages`.

The local engine never contacts a CDN. The zero-config default is the `embedpdf.wasm` your bundler emits beside your code (`@embedpdf/engine-runtime-wasm32/wasm-url`, which webpack, Vite, Rspack, Parcel, and Turbopack all resolve), and it is now streamed and compiled by the worker as it downloads — the previous fetch-then-fallback path had given up streaming. When a toolchain cannot carry that asset (Angular's application builder, plain esbuild), boot fails with the fix named instead of silently fetching a possibly mismatched binary from jsDelivr: `DEFAULT_WASM_URL` and the fetch-failure fallback are gone.

New `@embedpdf/engine/portable`: the same `localEngine()` with the wasm delivered through the module graph — a lazy chunk of your own build, gzipped and inflated in the browser — so it works with every bundler at the same cost over the wire, with no asset to copy. `wasmLoader` joins `wasmUrl`, `assetsUrl`, and `wasmBinary` as an explicit source (bytes produced on demand at boot). Explicit sources never fall back.

Angular needs neither: the package's export map routes the `es2020` condition Angular's application builder resolves with to the portable build, so the plain `@embedpdf/engine` import is zero-config under Angular too. Other bundlers do not declare that condition and keep the streamed asset.
