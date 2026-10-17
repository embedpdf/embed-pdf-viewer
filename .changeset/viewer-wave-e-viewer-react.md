---
'@embedpdf/viewer-react': minor
---

`<PDFViewer>` marks the element it renders `data-epdf-wrapped`, so after server rendering the viewer starts once, with the props, when hydration sets them, never first from the element's attributes.
