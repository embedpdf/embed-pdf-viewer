---
'@embedpdf/engines': patch
---

Implement getPageTextRuns in PdfiumNative, WebWorkerEngine, and RemoteExecutor for extracting rich text runs with font, size, and color metadata. Implement renderPageRaw and renderPageRectRaw in WebWorkerEngine for returning raw ImageDataLike pixel data without encoding.
