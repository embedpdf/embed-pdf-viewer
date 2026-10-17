---
'@cloudpdf/engine': minor
---

`page.render.image()` makes print pictures (`usage: 'print'`, `viewport: { kind: 'dpi', dpi: 150 | 300 }`), fetched from the print family's path at its tier (`render/print/…` or `render/print-high/…`). A session whose rights the client knows is refused before the request without `doc.print`, or `doc.print.high` at 300 DPI.
