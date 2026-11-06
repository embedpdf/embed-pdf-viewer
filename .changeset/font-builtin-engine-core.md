---
'@embedpdf/engine-core': minor
---

Every font in `doc.fonts.list()` says whether the engine comes with it: `builtIn` is `true` for the standard fonts and for the Hebrew and Arabic fallback fonts the engine adds on its own, and `false` for the fonts you register (your server's, on the cloud) and the document's. A font picker can leave out the built-in fallback fonts, which fill in characters whichever font a box names.
