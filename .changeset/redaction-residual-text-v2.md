---
'@embedpdf/pdfium': patch
---

Fix text redaction when multiple regions intersect the same text object. Later
regions no longer leave targeted text searchable or copyable in saved PDFs or
remove neighboring text. Preserve the positions of remaining text, including
vertical text, and leave text outside the redaction regions unchanged.

Backports the text-matrix fix for
[#801](https://github.com/embedpdf/embed-pdf-viewer/issues/801) to the v2 WASM build.
