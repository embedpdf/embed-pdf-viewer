---
'@embedpdf/plugin-render': patch
---

Add renderPageRaw and renderPageRectRaw methods to RenderCapability and RenderScope for returning raw ImageDataLike pixel data, useful for AI/ML pipelines that need direct pixel access without Blob encoding.
