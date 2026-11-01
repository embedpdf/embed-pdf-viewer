---
'@cloudpdf/engine': minor
---

Share links keep their visitor. Every renewal sends the handle the last exchange answered, so the visitor and, on a per-visitor link, their layer stay the same; an open document also renews on a timer, so a visitor who only reads still counts as seen. When the link keeps visitors' layers, the handle waits in the engine's `visitorStore` for the next open: the browser's `localStorage` by default, none outside a browser (`browserVisitorStore()`, or a store of your own). `open({ kind: 'share', shareToken, restart: true })` deletes the kept layer and starts a new visitor, and `doc.share` says whether the layer is shared or the visitor's own and whether it is kept. An open whose layer was deleted under it (another tab started over) refuses with `Forbidden` (`details.reason: 'layer-changed'`); opening again picks up the new layer.
