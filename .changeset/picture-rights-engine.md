---
'@embedpdf/engine': minor
---

Pages render thumbnails: `page.render.image({ viewport: { kind: 'thumbnail' } })` is the whole page at 512 pixels on its long side, and needs only `doc.render.thumbnail`, which `doc.render` includes. Each picture now needs only its own permission: print pictures need `doc.print` (and `doc.print.high` at 300 DPI) without `doc.render`, and a scope without `doc.render` is refused screen pictures, as on a CloudPDF server.
