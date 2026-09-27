---
'@embedpdf/engine-runtime': minor
---

Adds `EPDF_SetDecodedImageBudget` and `EPDF_GetDecodedImageBytes`: a store of decoded images kept across page loads, off by default, so an image rendered again after its page's image cache was emptied is not decoded again. A kept decode renders the same bytes as a new one. It also keeps images above PDFium's 60 MB limit, which PDFium otherwise decodes again from the first row on every render. Closing a document drops its decodes.
