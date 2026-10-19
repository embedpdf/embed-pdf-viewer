---
'@embedpdf/engine-runtime': minor
---

Add captures (`public/epdf_capture.h`): the layer's own versions of what a write is about to lose or replace, as bytes, and their import, which puts them back. `EPDFPage_ExportAnnotsRawToOwnedBuffer` / `EPDFPage_ImportAnnotsRaw` capture annotations with their positions (what a delete removes) and put them back at the same numbers and positions; `EPDFForm_ExportFieldRawToOwnedBuffer` / `EPDFForm_ImportFieldRaw` do the same for a terminal field, its widgets and the parents its delete prunes; `EPDFDoc_ExportDictRawToOwnedBuffer` / `EPDFDoc_ImportDictRaw` capture one dictionary as it reads now, with the objects under chosen keys (such as `/AP`), and put it back exactly, whole when a save dropped it. A capture never holds the uploaded file's originals, and an import never replaces a version the layer holds. Imports run inside a layer transaction; none loads a page.
