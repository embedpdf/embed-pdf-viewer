---
'@embedpdf/engine': patch
---

The default Hebrew and Arabic fallback fonts are listed with `builtIn: true`, the fonts you give `localEngine()` with `builtIn: false`. A font listed in both `fonts` and `fallbackFonts` is registered once, and fills in characters where `fallbackFonts` lists it.
