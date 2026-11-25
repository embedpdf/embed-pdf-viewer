---
'@embedpdf/engine': patch
---

Start up faster in the browser. The engine worker used to fetch and compile `embedpdf.wasm` only after its own script had downloaded and run, one after the other. A small worker of its own now compiles the wasm (streaming) as the engine worker is created and hands the compiled module straight to it over a `MessageChannel`, so both happen at once, and the compile is not held back by a busy main thread. Where that can't run (a page CSP without `blob:` workers or `'wasm-unsafe-eval'`, a server that sends the wasm with the wrong MIME type), the engine worker loads it from the URL as before.
