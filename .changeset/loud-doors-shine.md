---
'@embedpdf/plugin-document-manager': patch
---

Added optional `name` property to `LoadDocumentUrlOptions` to allow specifying a custom document name. When not provided, the name is extracted from the URL. If extraction fails, `undefined` is returned to allow downstream handling of default names.
