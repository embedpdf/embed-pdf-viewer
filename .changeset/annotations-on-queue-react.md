---
'@embedpdf/react': patch
---

`<AnnotationLayer>` draws again once its `interactive` renderers are registered, so such a renderer takes the pointer from the first frame after mount, not only after the next change on the page.
