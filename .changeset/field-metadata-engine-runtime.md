---
'@embedpdf/engine-runtime': minor
---

Form fields get `/EMBD_Metadata`, the same way annotations do. `EPDFForm_HasFieldEmbedMetadata` and `EPDFForm_GetFieldEmbedMetadata{String,Number,Boolean,JSON}` read a field's own metadata from a loaded form model. `EPDFForm_SetFieldEmbedMetadata{String,Number,Boolean,JSON}`, `EPDFForm_ClearFieldEmbedMetadataKey` and `EPDFForm_ClearFieldEmbedMetadata` write it on the field's own dictionary, never a parent's. This reaches fields no annotation handle reaches, such as a radio group's. `EPDFDocument_ClearEmbedMetadata` now clears form fields too. The `EPDF_RENDER_WIDGETS` render flag works with or without `FPDF_ANNOT`: alone, a page render draws its form fields and no other annotation.
