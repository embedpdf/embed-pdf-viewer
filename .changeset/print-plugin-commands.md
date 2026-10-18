---
'@embedpdf/plugin-commands': minor
---

`document:print` prints the document in scope through the kernel's `documents.print()`, which runs the document's own print actions around the dialog. `StandardCommandsPlatform` no longer has `print`, and the package no longer depends on `@embedpdf/plugin-actions`.
