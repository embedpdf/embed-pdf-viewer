---
'@embedpdf/plugin-render': minor
---

Another plugin can paint the page pictures: `render.handOverPictures({ paints(view), paint(host, page) })` hands it every `<RenderLayer>` whose view `paints` accepts, and the render plugin fetches nothing for them. `paint` gets the layer's box and the page (`ref`, `pageIndex`, `view`, `transform`, `getViewDemand`), and returns `{ update(page), destroy() }`: `update` follows the zoom, a turn or a reorder, `destroy` comes when the page goes or the pictures are given back. One plugin paints them at a time: a second is refused (`conflict`). It returns the function that gives them back; otherwise they stay handed over until the document closes. Taken in a plugin's `connect()`, the hand-over holds from the first layout. `getPicturePainter()` says which painter holds them.
