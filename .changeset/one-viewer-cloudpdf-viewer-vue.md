---
'@cloudpdf/viewer-vue': minor
---

The component is `<PDFViewer>`, the same as `@embedpdf/viewer-vue`'s (it was `<CloudPDFViewer>`), with the cloud's config: `src` as `{ token }`, `{ id }` or `{ shareToken }`, and the cloud engine's settings under `engine` (`:engine="{ baseUrl }"` for your own server, CloudPDF SaaS without it; `base-url`, `token` and `fetch` were props). `resolveCloudConfig` is gone.
