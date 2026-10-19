---
'@embedpdf/engine-services': minor
---

The page renderer draws print pictures (`usage: 'print'`): with PDFium's printing flag, so layers take their print state and annotations and form fields draw by their `print` flag, sized by the picture's `dpi` viewport.
