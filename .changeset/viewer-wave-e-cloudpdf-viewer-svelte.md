---
'@cloudpdf/viewer-svelte': minor
---

Introduces the Svelte wrapper for the CloudPDF-powered full viewer. `<CloudPDFViewer>` takes the CloudPDF connection and a document's token, id or share token, supplies the cloud engine itself, and passes every other viewer option, your components and `bind:element` through to `@embedpdf/viewer-svelte/core`'s `<PDFViewer>`; `src`, `scope` and `identity` aren't there, because the document's token carries them. The package re-exports the open viewer's vocabulary and the cloud's `ViewerConfig`.
