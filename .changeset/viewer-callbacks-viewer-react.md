---
'@embedpdf/viewer-react': patch
---

`onReady` and `onDocumentChange` are config keys of `ViewerConfig`, which `<PDFViewer>` passes to the viewer. They keep calling the latest prop, so an inline callback is no change.
