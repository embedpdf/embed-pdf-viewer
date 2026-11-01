---
'@cloudpdf/server': minor
---

Each kind of page picture needs its own permission and no other. Thumbnails have routes of their own, at the document's and a layer's path (`render/thumbnail/…`), and need `doc.render.thumbnail`, which `doc.render` includes: the whole page at 512 pixels on its long side, cached like print pictures and never classified against the render lattice. Print pictures no longer need `doc.render`: `doc.print` is enough, and `doc.print.high` for 300 DPI. `/access` lists `doc.render.thumbnail` in `effectiveScope` for a session with `doc.render`. A server module's raw render can ask for a thumbnail, which needs `doc.render.thumbnail` in its `requires.document`.
