---
'@embedpdf/angular': patch
---

`<epdf-render-layer>` in an `<epdf-page-view>` given another page releases the old page's tile demand (it was kept until the layer went, and then the new page was released instead), and plans the new page even when its size is the same.
