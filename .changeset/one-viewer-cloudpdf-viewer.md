---
'@cloudpdf/viewer': minor
---

The CloudPDF viewer is the open-source viewer with the cloud engine as its default, as `@embedpdf/viewer` is the same viewer with the built-in one. Importing it registers the cloud engine on `<embedpdf-viewer>`, so plain HTML uses the same element (a cloud document is given from script: `viewer.src = { shareToken }`), and `CloudPDF.init()` is the same function as `EmbedPDF.init()`. The engine's settings go under `engine`, `engine: { baseUrl, token, fetch }`, with CloudPDF SaaS when there's no `baseUrl` (they were top-level keys, and `baseUrl` was required). `.` is the door for a bundler, sharing `@embedpdf/viewer/core` with the app; `./snippet` is `dist/cloudpdf.js`. `./config` and `resolveCloudConfig` are gone.
