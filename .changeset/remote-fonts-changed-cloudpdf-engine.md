---
'@cloudpdf/engine': patch
---

A document opened with a token that may not read another client's write, its annotations or its form fields, now hears `fonts.changed` when that write changed the document's fonts, as one that may read the write does.
