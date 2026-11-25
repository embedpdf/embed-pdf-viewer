---
'@embedpdf/engine-runtime': minor
---

The runtime moves to PDFium of Nov 23, 2026.

Adds `EPDFText_GetPageGeometry`, which reads the geometry of a range of a page's characters in one call: for each character, what `EPDFText_GetCharGeometry`, `FPDFText_GetTextObject` and `FPDFText_GetFontSize` answer one character at a time.

A drawing is no longer a stamp's alone: a mark in a form widget and a push button's icon can place one too, and the document holds it once. `EPDFAnnot_SetDrawing`, `EPDFAnnot_GetDrawing` and `EPDFDoc_GetDrawings` are the new names of `EPDFAnnot_SetStampDrawing`, `EPDFAnnot_GetStampDrawing` and `EPDFDoc_GetStampDrawings`, which are gone. Adds `EPDFAnnot_SetMKIcon`, `EPDFAnnot_GetMKIcon`, `EPDFAnnot_ClearMKIcon` and `EPDFAnnot_HasMKIcon` for a push button's icons. A push button with an icon is drawn with it, alone or beside its caption, where it was drawn as its caption only.

Fixes:

- A redaction, or any other change to page content, no longer moves the rest of a page whose content is cut into several streams, as "Microsoft: Print To PDF" writes it.
- A form field whose border is only in `/Border` is drawn with that border's width and dash, where it was drawn 1 wide and solid. Setting a border's style or dash pattern moves such a border into `/BS` first, so its width stays.
- Closing a handle from `EPDFPage_GetAnnotRaw` or `EPDFPage_CreateAnnotRaw` frees the page it is built on, about 1.4 KB for each, which leaked. Code that closed that page itself, through the pointer inside the handle, must stop doing so.
- On the native runtime, closing one of two engines on a thread no longer crashes the other.
