---
'@cloudpdf/server': major
'@cloudpdf/admin-api': major
'@cloudpdf/admin': major
'@cloudpdf/engine': major
'@cloudpdf/viewer': major
'@cloudpdf/viewer-react': major
'@embedpdf/engine-core': major
'@embedpdf/engine-services': major
'@embedpdf/engine': major
'@embedpdf/viewer': major
'@embedpdf/viewer-chrome': major
'@embedpdf/viewer-react': major
---

Initial public release of the CloudPDF server stack, the Engine v3 packages, and the full viewer.

- `@cloudpdf/server`: self-hostable Fastify HTTP/REST server fronting a native EmbedPDF Runtime (PDFium fork) worker pool.
- `@cloudpdf/admin` / `@cloudpdf/admin-api`: Node admin SDK and shared HTTP contracts.
- `@cloudpdf/engine`: cloud client speaking the Engine v3 interface over HTTPS.
- `@cloudpdf/viewer`: the full viewer wired to the CloudPDF engine — one CDN artifact (`cloudpdf.js`), no wasm, no workers.
- `@embedpdf/engine-core`: transport-agnostic Engine v3 core (interfaces, DTOs, wire schemas, conformance harness).
- `@embedpdf/engine-services`: runtime-agnostic Engine v3 service implementations.
- `@embedpdf/engine`: local WASM engine powered by EmbedPDF Runtime, our PDFium fork (renamed from `@embedpdf/engine-local`).
- `@embedpdf/viewer`: the full viewer — `<embedpdf-viewer>` element, `EmbedPDF.init()`, the self-locating CDN snippet (`embedpdf.js`), and the engine-agnostic `/core` entry.
- `@embedpdf/viewer-react`: `<PDFViewer>` React wrapper with children-as-slots.
