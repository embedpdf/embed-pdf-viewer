---
'@embedpdf/engines': minor
---

Add font fallback system for PDFs with non-embedded fonts

- **FontFallbackManager**: Pure TypeScript implementation using Emscripten's `addFunction` API to hook into PDFium's `FPDF_SYSFONTINFO` interface
- **CDN font loading**: Default configuration loads fonts from `@embedpdf/fonts-*` packages via jsDelivr CDN
- **Advanced font matching**: Supports multiple font weights and italic variants with CSS-like matching algorithm
- **Node.js support**: `createNodeFontLoader` helper for file system-based font loading
- **Framework integration**: `fontFallback` option added to React, Vue, Svelte, and Preact hooks
- **Worker support**: Font fallback enabled by default in browser worker engine (uses CDN)

Supported charsets: Japanese (SHIFTJIS), Korean (HANGEUL), Simplified Chinese (GB2312), Traditional Chinese (CHINESEBIG5), Arabic, Hebrew, Cyrillic, Greek, Vietnamese
