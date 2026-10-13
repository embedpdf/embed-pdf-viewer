---
'@embedpdf/plugin-form': patch
---

Internal: the controller composes through the kernel's `composeApi`; page ↔ PDF conversion goes through the kernel's page geometry instead of a copy of its own.
