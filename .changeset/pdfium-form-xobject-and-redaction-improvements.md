---
'@embedpdf/pdfium': patch
---

Improved PDF editing and redaction capabilities with Form XObject support and enhanced image handling

**Text Redaction Improvements**

- Individual subpath extraction and redaction for complex paths (e.g., vector text in logos)
- Instead of removing entire path objects, individual letter glyphs can now be selectively redacted
- Fixed image-to-page transform matrix ordering for accurate redaction positioning

**Enhanced Image Redaction**

- Added 1-bit image support with proper ImageMask handling
- ImageMask images now correctly use the fill color from the graphics state
- Added JPEG SMask (soft mask) decoding for proper transparency handling in WASM
- Inline images (BI...ID...EI format) are now converted to XObject images for editing
- Improved handling of paletted/indexed images with alpha transparency

**Form XObject Content Editing**

- Added proper support for editing content within Form XObjects (embedded forms in PDFs)
- Form XObject streams are now edited in-place rather than attempting to add/remove separate content streams
- Added `GetMutableFormStream()` API to CPDF_PageObjectHolder for direct Form XObject access

**Pattern Color Support**

- Added Pattern resource tracking in page content generation
- Pattern colors are now properly preserved and emitted during content regeneration
- Added fill/stroke pattern resource name tracking in color state
