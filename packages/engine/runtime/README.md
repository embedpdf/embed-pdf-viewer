# @embedpdf/engine-runtime

Low-level PDF execution runtime for EmbedPDF.

This package is powered by [EmbedPDF Runtime](https://github.com/embedpdf/runtime), our fork of PDFium, and provides a single runtime abstraction over WebAssembly and native Node.js builds. Most users should continue to use `@embedpdf/engines`; this package is the implementation layer used by future engine releases.

PDFium is a Google project; EmbedPDF Runtime is an independent fork, not affiliated with or endorsed by Google.

## Packages

- `@embedpdf/engine-runtime` - pure JavaScript loader and shared types.
- `@embedpdf/engine-runtime-wasm32` - WebAssembly runtime.
- `@embedpdf/engine-runtime-<platform>` - native Node.js runtime packages.

The main package resolves the best runtime for the current environment and falls back to WebAssembly when a native runtime is unavailable.
