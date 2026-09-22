---
'@embedpdf/plugin-form': patch
'@embedpdf/plugin-redaction': patch
'@embedpdf/plugin-measurement': patch
'@embedpdf/plugin-annotation': patch
'@embedpdf/plugin-signature': patch
'@embedpdf/plugin-stage': patch
'@embedpdf/plugin-stamp': patch
'@embedpdf/plugin-actions': patch
---

Internal: controllers compose through the kernel's `composeApi`; page ↔ PDF conversion goes through the kernel's page geometry instead of per-plugin copies.
