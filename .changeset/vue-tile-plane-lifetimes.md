---
'@embedpdf/vue': patch
---

`<RenderLayer>`'s tiles follow zooms and scrolls again. The tile plane released its page whenever the page context changed (every zoom), right after sending the new demand, so the render plugin forgot the page and its tiles went. The page's claim and the view's handle now follow the page and the view only; a camera move just sends a new demand.
