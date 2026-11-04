---
'@embedpdf/plugin-render': minor
---

`renderPage` renders part of a page: `rect`, in page space, cut at the page's edge (one that misses the page is `invalid-input`), sized by `width` or `scale`. `rotation` turns the picture. Either one renders for its caller alone, outside the layers' cache. New `snapshot` tool, added when the interaction plugin is there: drag a box on a page, or click for the whole page, and the box is held as the snapshot, `{ page, rect, image }`, its picture a PNG at `snapshot.scale` (default 2) pixels per point, turned as the page is shown, made smaller to fit 16 million pixels or the deployment's budget, and rendered once every change made before it is in. New `canSnapshot()` (`doc.render` and `doc.content.copy`), `getSnapshot()`, `clearSnapshot()`, `onSnapshotChanged`, the `snapshot` settings (`scale`, `box.fill`, `box.stroke`) and, on the host lens, `getSnapshotBox(page)`.
