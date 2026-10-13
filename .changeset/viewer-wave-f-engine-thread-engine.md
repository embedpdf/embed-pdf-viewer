---
'@embedpdf/engine': minor
---

Where the engine runs in its worker, the page's main thread no longer downloads the engine host and PDFium's runtime: they load, as a chunk of their own, only when an engine boots in the page itself (no `Worker`, as in Node, or `createLocalEngine()`). The same engine, the same fallback and the same errors; in a minimal Vite app with the viewer, the main thread's first download of JavaScript is a third smaller (a fifth gzipped). `InlineTransport` is no longer exported: `createLocalEngine()` runs PDFium in the current thread.
