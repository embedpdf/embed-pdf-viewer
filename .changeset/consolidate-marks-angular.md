---
'@embedpdf/angular': patch
---

The annotation, form, measurement, signature and stamp entry points use the shared implementations in `@embedpdf/web` and the plugins; nothing they do changes. `SignerRow` is the signature plugin's own type now (the same fields, read-only), and `restoreStampLibraries` from `@embedpdf/angular/stamp` is the plugin's own, which takes `EpdfStamp` as it is.
