---
'@embedpdf/engine-core': minor
---

Each kind of page picture needs its own permission and no other. A new permission, `doc.render.thumbnail`, allows thumbnails, and `doc.render` includes it (`caps.doc.render.thumbnail()`). A thumbnail is a `{ kind: 'thumbnail' }` viewport: the whole page, `PAGE_THUMBNAIL_SIZE` (512) pixels on its long side, drawn by the screen's rules; it takes no `target`. Print pictures no longer need `doc.render`: `doc.print`, and at 300 DPI `doc.print.high`, is enough, so a session can print, or have thumbnails, without rendering pages. `checkRenderUsage` checks each picture's own right, and takes `PagePictureRights` (`render`, `thumbnail`, `print`, `printHigh`) in place of `PagePrintRights`. On the wire, thumbnails have their own families and addresses (`PAGE_THUMBNAIL_FAMILIES`, `render/thumbnail/…`, `wirePaths.docPageThumbnail` and `layerPageThumbnail`), and `pagePictureOf(layers, options)` picks the picture from the render options.
