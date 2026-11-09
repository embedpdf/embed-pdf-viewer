---
'@embedpdf/engine-core': minor
---

An annotation update can change `nm`. A new name renames the annotation in place, and `nm: null` removes its name. A new name must be free on its page, checked against the page as the change's earlier ops left it; an undo puts back the name the annotation had. The conformance suites check renames, and `runChangeConformance`'s `open` option takes the PDF to open, such as `NAMES_FIXTURE_PDF`, a file with missing and shared names.
