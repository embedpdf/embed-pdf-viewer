---
'@embedpdf/vue': patch
---

The runtime hands the kernel the browser's printer (`browserPrinter()` from `@embedpdf/web`), so `documents.print()` and `preparePrint()` print.
