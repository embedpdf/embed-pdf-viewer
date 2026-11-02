---
'@embedpdf/engine': minor
---

`doc.fonts` on a local document lists, resolves and serves the document's fonts: `list()`, `resolve(request)`, `getProgram(displayHash)` and `downloadProgram(displayHash)`. The standard fonts and the last resort are served from `@embedpdf/core-fonts`, loaded the first time a document's fonts are asked for. Once a document's fonts have been listed, `fonts.changed` says when a write adds a font to it, and every document says so when the engine's fonts are registered, cleared or given fallbacks.

A form field font a browser can't load as it is (Type 1 or bare CFF) is listed with a display program, which `downloadProgram()` returns: the same glyphs at the same advances as the engine draws them, so a field typed in such a font shows in it.

Hebrew and Arabic work with no setup: `localEngine()` loads Noto Sans Hebrew and Noto Naskh Arabic (`@embedpdf/default-fallback-fonts`, about 320 KB as lazy chunks of your build) while it starts and adds them as fallback fonts, tried after your `fallbackFonts` whatever their style. `localEngine({ defaultFallbackFonts: false })` leaves them out, and `engine.fonts.clearFallbacks()` removes them with yours. A character no font has is drawn with the last-resort font, as a box, on every engine. Filling in a form field and drawing a redaction label report the characters they drew with no font in `meta.missingCharacters`.

A write that changes the fonts the document's list shows ends its own events with `fonts.changed`, published before the write settles, once the document's fonts were listed; the engine no longer lists them again after every write to find out.
