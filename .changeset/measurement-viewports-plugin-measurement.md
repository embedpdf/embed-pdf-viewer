---
'@embedpdf/plugin-measurement': minor
---

A page's scale comes with the page: opening a document no longer reads every page's viewports, so `getPageScale(page)` is ready at once and `ensureLoaded()` resolves at once. A scale change (calibrate, set, unit, precision, preset or clear) is one change of the document, the scale and the re-measured measurements together: one request and one undo step, however many pages it covers. A refused change fails every page of it.
