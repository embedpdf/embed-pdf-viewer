---
'@cloudpdf/engine': minor
---

`doc.fonts` on a cloud document: `list()` (at the manifest's `fontsVersion` and the server's fonts, refreshed on a stale pin), `resolve(request)`, `getProgram(displayHash)` and `downloadProgram(displayHash)`, which fetches a served server font from its one URL for every document. A write that changes the fonts the document's list shows ends its events with `fonts.changed`, own writes and other sessions' alike. Every picture's URL carries the server's fonts (`serverFonts`).
