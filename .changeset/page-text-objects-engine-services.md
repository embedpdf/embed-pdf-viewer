---
'@embedpdf/engine-services': minor
---

`pages.textObjects` reads a page's objects through `PageTextObjectsReader`. Glyphs come from the text page and are put back in pen order along each object's baseline: right-to-left text the text page keeps in logical order is reversed, and the brackets it mirrored are mirrored back.
