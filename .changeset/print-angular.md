---
'@embedpdf/angular': patch
---

The runtime hands the kernel the browser's printer (`browserPrinter()` from `@embedpdf/web`), and the documents service has `preparePrint()`, `print()` and `getPrintQuality()`.
