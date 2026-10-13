---
'@embedpdf/engine': patch
---

zod never reaches the page or an app's bundler. The engine's client imports only engine-core's zod-free entries, and the schemas run where the engine does. An engine with no `Worker` (a browser without one, or `createLocalEngine()` in a page) now loads one self-contained file the package ships, `workers/inline-transport.js` (1043 KB, 203 KB gzipped): the engine host, PDFium's runtime, the schemas and the one copy of zod, with nothing left for a bundler to resolve, so Parcel 2 builds and runs the viewer with its defaults. A page with a worker never fetches it. In Node the engine imports the host and runtime as packages, whatever conditions the resolver asks for: a test run that asks for `browser` (as a Svelte app's does) still boots the Node build, and so does a DOM environment that asks for `browser` alone. That fallback now takes the wasm location the engine resolves for its worker, so `wasmUrl`, `assetsUrl`, `wasmBinary` and the portable entry's inline wasm apply to it too.

The worker refuses an annotation create or update whose rect has `Infinity` or `NaN` in it, with `InvalidArg` on `rect`.
