---
'@embedpdf/pdfium': patch
---

Improved PDF content handling with the following changes:

- **Shading object support**: Shading patterns (gradients, mesh shadings) are now properly preserved and regenerated when modifying PDF pages. Previously, shading objects could be lost during page content updates.

- **Shading redaction**: Redaction now correctly removes shading objects that fall entirely within a redaction area, ensuring complete content removal.

- **Graphics state preservation**: Existing graphics state resources (such as soft masks, overprint modes, and other advanced properties) are now preserved with their original names during content regeneration.
