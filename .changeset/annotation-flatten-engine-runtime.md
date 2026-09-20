---
'@embedpdf/engine-runtime': minor
---

`EPDFPage_FlattenAnnotations` flattens a chosen set of a page's annotations with a per-entry status (applied, skipped, not-on-page), replacing the single-annotation `EPDFAnnot_Flatten`. `EPDFPage_ExportAnnotationsAsDocument` flattens a set's appearances into a new single-page document sized to their union rect, replacing `EPDFAnnot_ExportAppearanceAsDocument` and `EPDFAnnot_ExportMultipleAppearancesAsDocument`, which mishandled rotated appearances and the rect fit. Whole-page flatten, selective flatten, and export now share one candidate plan and one placement writer (ISO 32000-2 12.5.5 fit, `/Matrix` honored, no content re-parsing); resources shared between exported appearances are cloned once.

New named-page functions: `EPDFDoc_GetNamedPageCount`, `EPDFDoc_GetNamedPageAt` (key as UTF-16 plus the value's object number and kind: page, template, or dangling), `EPDFDoc_SetNamedPage` (create or replace, pages in the page tree only), `EPDFDoc_RemoveNamedPage`, and `EPDFDoc_RemoveNamedPagesForPage`. `EPDFDoc_DeletePageByObjectNumber` now removes the `/Names /Pages` registrations of the page it deletes. The name-tree index search reports a pair whose value is a missing object (with a null value) instead of hiding it and desynchronizing later indices.

Annotation `/Name` is text: `EPDFAnnot_SetName` takes any name, writes a name object (escaping applied by the serializer), and never touches `/AP`; `EPDFAnnot_GetName` fills a text buffer. The `FPDF_ANNOT_NAME` enum, its subtype validation, and the sentinel that removed `/Name` together with `/AP` are removed — remove `/Name` with `EPDFAnnot_RemoveKey(annot, "Name")`.
