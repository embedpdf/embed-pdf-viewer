---
'@embedpdf/core-js-sandbox': patch
---

PDF JavaScript runs in Next.js apps again.

- Turbopack, the default bundler in Next 16, failed with "Can't resolve '#quickjs-variant'", because it doesn't follow an `imports` target that names another package. `#quickjs-variant` now maps to two files of this package, `quickjs-variant/browser.js` and `quickjs-variant/wasmfile.js`, which re-export QuickJS's browser and wasm-file builds.
- Production builds on Next before 16.4.1, webpack or Turbopack, broke QuickJS's browser build, so the sandbox never started. QuickJS 0.32.0 embeds its wasm as raw bytes in a template literal, and Next's minifier turned some of them into octal escapes ("Octal escape sequences are not allowed in template strings"). QuickJS is pinned to 0.31.0, which embeds the wasm as base64.

Browsers still get the browser build, with no `.wasm` request, and Node the wasm-file one.
