---
'@embedpdf/plugin-render': patch
---

Registering fonts on the local engine after pages were drawn repaints every page: a page's text draws a glyph its own font lacks from a registered fallback, so a page drawn before the fallback arrived kept the old one. A write's `fonts.changed` repaints nothing more than its own events do.
