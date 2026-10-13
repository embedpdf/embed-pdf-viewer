---
'@cloudpdf/viewer-angular': minor
---

The component is `EpdfPdfViewer`, `<epdf-pdf-viewer>`, the same as `@embedpdf/viewer-angular`'s (it was `CloudPdfViewer`, `<cloudpdf-viewer>`), with the cloud's config: `[src]` as `{ token }`, `{ id }` or `{ shareToken }`, and the cloud engine's settings in `[engine]` (`{ baseUrl }` for your own server, CloudPDF SaaS without it; the required `baseUrl` input and the `token` and `fetch` inputs are gone). `resolveCloudConfig` is gone.
