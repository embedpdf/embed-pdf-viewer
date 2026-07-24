---
'@cloudpdf/server': minor
'@cloudpdf/admin-api': minor
'@cloudpdf/admin': minor
'@cloudpdf/engine': minor
'@cloudpdf/viewer': minor
'@embedpdf/engine-core': minor
'@embedpdf/engine-services': minor
'@embedpdf/engine': minor
'@embedpdf/viewer': minor
'@embedpdf/viewer-react': minor
---

Initial public release of the CloudPDF server stack, the Engine v3 packages, and the full viewer.

- `@cloudpdf/server`: self-hostable Fastify HTTP/REST server fronting a native PDFium worker pool.
- `@cloudpdf/admin` / `@cloudpdf/admin-api`: Node admin SDK and shared HTTP contracts.
- `@cloudpdf/engine`: cloud client speaking the Engine v3 interface over HTTPS.
- `@cloudpdf/viewer`: the full viewer wired to the CloudPDF engine — one CDN artifact (`cloudpdf.js`), no wasm, no workers.
- `@embedpdf/engine-core`: transport-agnostic Engine v3 core (interfaces, DTOs, wire schemas, conformance harness).
- `@embedpdf/engine-services`: runtime-agnostic Engine v3 service implementations.
- `@embedpdf/engine`: local WASM PDFium engine (renamed from `@embedpdf/engine-local`).
- `@embedpdf/viewer`: the full viewer — `<embedpdf-viewer>` element, `EmbedPDF.init()`, the self-locating CDN snippet (`embedpdf.js`), and the engine-agnostic `/core` entry.
- `@embedpdf/viewer-react`: `<PDFViewer>` React wrapper with children-as-slots.
