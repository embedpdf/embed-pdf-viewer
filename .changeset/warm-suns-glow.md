---
'@embedpdf/snippet': minor
---

Add global permission configuration to snippet viewer:

- Add `permissions` option to `PDFViewerConfig` for global permission overrides
- Support `enforceDocumentPermissions` to ignore PDF permissions entirely
- Support `overrides` with human-readable names (`print`, `modifyAnnotations`, etc.) or numeric flags
- Update command permission checks to use effective permissions via `getEffectivePermission`
- Pass permission configuration to `EmbedPDF` via new `config` prop
