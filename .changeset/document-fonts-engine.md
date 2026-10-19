---
'@embedpdf/engine': minor
---

`doc.fonts` on a local document lists, resolves and serves the document's fonts: `list()`, `resolve(request)`, `getProgram(displayHash)` and `downloadProgram(displayHash)`. The standard fonts and the last resort are served from `@embedpdf/core-fonts`, loaded the first time a document's fonts are asked for. Once a document's fonts have been listed, `fonts.changed` says when a write adds a font to it, and every document says so when the engine's fonts are registered, cleared or given fallbacks.

A form field font a browser can't load as it is (Type 1 or bare CFF) is listed with a display program, which `downloadProgram()` returns: the same glyphs at the same advances as the engine draws them, so a field typed in such a font shows in it.
