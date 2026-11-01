---
'@embedpdf/plugin-render': minor
---

Thumbnails have their own permission. `renderThumbnail(page, options?)` now renders the page's thumbnail, the whole page at 512 pixels on its long side, and needs only `doc.render.thumbnail` (which `doc.render` includes); its `maxWidth` option is gone, so show the picture smaller with CSS, or use `renderPage` for an exact width. `canRenderThumbnail()` says whether the session may have them. A layer asks for a thumbnail with `thumbnail: true` in `renderSource` and `getSourceKey`: one picture per page, whatever the scale.
