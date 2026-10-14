---
'@cloudpdf/viewer-angular': minor
---

Introduces the Angular wrapper for the full viewer wired to CloudPDF: `<cloudpdf-viewer>` (`CloudPdfViewer`), the open-source `<epdf-pdf-viewer>` of `@embedpdf/viewer-angular/core` with its engine made from the cloud options. Give it `baseUrl` and the document with `docToken`, `docId` or `shareToken` (with `sharePassword`), or several with `documents`; every other input, output and template of the open viewer works the same, without `src`, `scope` and `identity`, which the document's token carries. The local engine loads only when stamps or signatures need it. It re-exports `@embedpdf/viewer-angular/core`, with the cloud's `ViewerConfig` and `resolveCloudConfig`.
