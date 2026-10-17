---
'@embedpdf/engine': minor
---

`page.render.image()` and `render.raw()` make print pictures (`usage: 'print'`, `viewport: { kind: 'dpi', dpi: 150 | 300 }`): drawn by the print rules, sized for the paper, refused without `doc.print` (or `doc.print.high` at 300 DPI). Print pictures are off the render lattice, so an enforced lattice doesn't refuse them.
