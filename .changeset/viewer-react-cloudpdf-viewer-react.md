---
'@cloudpdf/viewer-react': patch
---

Marked `'use client'`, so `CloudPDFViewer` can be imported from a server component; it renders the empty element on the server. `usePDFViewer()`, `useCommand()` and `plugins` work here as in `@embedpdf/viewer-react`.
