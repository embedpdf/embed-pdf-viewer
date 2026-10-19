---
'@embedpdf/engine-runtime': minor
---

Read a document's fonts: `EPDFFontFaces_Load` lists every font face the document holds (from form, page, form XObject, pattern, soft mask, Type 3 and annotation appearance resources), each with its programs: object number, format, whether it is embedded whole or as a subset, PostScript name, embedding permission, whether it maps Unicode, SHA-256 and line metrics. `EPDFDoc_GetFontProgramData` and `EPDFDoc_GetFontProgramCoverage` read a program's bytes and the code points it covers. `EPDFDoc_ResolveFonts` says which font, registered or the document's own, would draw each run of text, with its fallbacks and the characters no font has, without writing.

Write with a document's own fonts: `EPDFAnnot_SetDefaultAppearanceDocumentFont` names a program the document holds whole in an annotation's default appearance, and the appearance draws its text with that program instead of embedding another. `EPDFAnnot_GetDefaultAppearanceFontPostScriptName` reads it back. Characters an appearance draws with no font are collected (`EPDFDoc_CountMissingCharacters`, `EPDFDoc_GetMissingCharacter`, `EPDFDoc_ClearMissingCharacters`).

Read registered fonts: `EPDFFont_GetProgramData`, `EPDFFont_GetProgramFormat`, `EPDFFont_GetProgramHash`, `EPDFFont_GetCoverage`, `EPDFFont_GetMetrics`, `EPDFFont_GetPostScriptName`, and `EPDFFont_GetFallbackOrder`, the order fallbacks are tried in for a weight and style.

Fix a default appearance naming a registered preview-and-print font that was not authorized for editing: new text no longer draws with it.
