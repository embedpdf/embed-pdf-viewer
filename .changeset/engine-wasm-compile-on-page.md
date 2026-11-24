---
'@embedpdf/engine': patch
---

Start up faster in the browser. The engine worker used to fetch and compile `embedpdf.wasm` only after its own script had downloaded and run, one after the other. The page now starts `WebAssembly.compileStreaming` on the wasm URL as it creates the worker, and hands the worker the compiled module, so both happen at once. Where the page can't compile it (a server that sends the wasm with the wrong MIME type, a page CSP without `'wasm-unsafe-eval'`), the worker loads it from the URL as before.
