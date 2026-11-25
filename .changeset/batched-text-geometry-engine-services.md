---
'@embedpdf/engine-services': minor
---

Read a page's text positions in batches. `PageGeometryReader` asks the runtime for up to 4,096 characters in one call with `EPDFText_GetPageGeometry`, where it made two calls and read 25 values for every character, and it no longer reads the cells of upright characters, which a run never carries. A page's geometry stays the same, and reading it takes about half the time on a page of text. The read of a very large page still stops at an abort, between two calls. Adds `appendGlyphRecords`, which decodes the runtime's records, and `EPDF_PAGE_CHAR_GEOMETRY_LAYOUT`.

A stamp of the picture a signature field's mark shows places the drawing the document already has for that mark, where it added a second copy.
