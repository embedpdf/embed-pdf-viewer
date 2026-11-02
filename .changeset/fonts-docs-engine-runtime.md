---
'@embedpdf/engine-runtime': minor
---

A rich text style can name the exact document program it draws with: `"program"` (the font program stream's object number) in `EPDFAnnot_SetRichTextJSON`'s body or run styles. The body's program becomes the `/DA` font. `/RC` and `/DS` still name the family, as a PDF does. A run that restates the body's face keeps its program, and a run in another face finds that face by its family. `EPDFDoc_ResolveFonts` takes the same per run (`programs`, or `NULL`), so two programs that describe themselves alike are told apart.
