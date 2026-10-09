---
'@embedpdf/react': patch
---

The annotation, form, measurement and signature hooks use the shared implementations in `@embedpdf/web` and the plugins; nothing they do changes. `SignerRow` is the signature plugin's own type now (the same fields, read-only).
