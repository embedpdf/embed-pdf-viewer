---
'@cloudpdf/viewer-vue': minor
---

Introduces the Vue wrapper for the full viewer on CloudPDF. `<CloudPDFViewer>` takes the CloudPDF connection (`base-url`, `token`) and a document by `doc-token`, `doc-id` or `share-token`, or several through `documents`, and renders `<PDFViewer>` from `@embedpdf/viewer-vue/core` with the cloud engine, so the local PDFium engine stays out of startup. Every other viewer prop, event and slot works as on `<PDFViewer>`; `src`, `scope` and `identity` are left out, because the document's token carries them.
