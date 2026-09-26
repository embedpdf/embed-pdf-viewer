---
'@embedpdf/viewer-react': minor
---

`<PDFViewer>` takes `onDocumentChange(documentId)` (the React face of the element's `epdf:documentchange` event) and warns once in development when a config prop changes after mount — config is init-only, like `<Viewer>`.
