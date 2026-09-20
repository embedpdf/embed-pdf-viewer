---
'@cloudpdf/engine': minor
---

The cloud engine implements `page(pon).annotations.flatten` over `POST …/annotations/pages/{pon}/items/flatten` (content and annotation planes patched in place, `annotations.flattened` published) and `page(pon).annotations.exportAppearance` over `POST …/items/appearance` (PDF bytes; a read).

It also implements `pages.setName` and `pages.removeName` over `POST …/pages/names` and `POST …/pages/names/delete`. Both advance only `docVersion` and `layoutVersion`, so the cached manifest is patched in place, per-page render/text/annotation leaves stay valid, and the result carries the fresh layout including `namedPages`.
