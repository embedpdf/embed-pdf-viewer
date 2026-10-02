---
'@embedpdf/plugin-stage': patch
---

Navigation called before the stage has a size is no longer lost. `goToPage()`, `goToFirstPage()`, `goToLastPage()`, `nextPage()`, `previousPage()`, `reveal()` and `goToDestination()` called as the document opens wait for the first placement; the last call lands instantly after the initial view (or a restored one), so the first frame already shows it. A PDF's open action to a page now opens there too.
