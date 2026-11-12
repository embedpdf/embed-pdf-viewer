---
'@embedpdf/engine-runtime': patch
---

The wasm runtime calls PDFium exports directly when a function takes no string and no `i64` argument and returns no string, instead of going through `cwrap`/`ccall`. Per-call overhead dominated loops of short native calls such as the per-glyph reads of `page.text.objects()`.
