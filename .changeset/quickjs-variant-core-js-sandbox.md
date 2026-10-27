---
'@embedpdf/core-js-sandbox': patch
---

The published package now picks its QuickJS build where it runs: `dist` keeps the `#quickjs-variant` import, so a browser bundler resolves QuickJS's browser build and Node its wasm-file build. Before, the build fixed the wasm-file build into `dist` for both.
