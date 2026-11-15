---
'@embedpdf/engine-core': minor
---

A page picture can be drawn in other colors: `PageRenderOptions.pageColors` takes a preset (`'normal'`, `'dark'` or `'sepia'`) or your own colors (`CustomPageColors`: `background`, `text`, `pathFill`, `pathStroke`, `textFill`, `textStroke` and `convertFillToStroke`, as `'#rrggbb'`). `resolvePageColors(pageColors)` gives the colors a renderer draws with, or `null` for the page as the file has it, and refuses anything else with `InvalidArg`, naming the field. A print picture takes no `pageColors`, like it takes no `background`. The render token never carries them.
