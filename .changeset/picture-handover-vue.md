---
'@embedpdf/vue': minor
---

`<RenderLayer>` lends its box to the plugin that paints its view's pictures (`handOverPictures` in the render plugin): it calls the painter's `paint` once per page, `update` as the page moves, and `destroy` when the page goes or the pictures are given back, and fetches no picture of its own meanwhile.
