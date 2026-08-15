---
'@embedpdf/engine-runtime': minor
---

Generate rotated caret appearances in the EmbedPDF PDFium runtime.

The caret appearance generator now consumes the shared rotation metadata pair, draws in the logical unrotated box, and emits the form transform needed for the baked caret to follow its text baseline.
