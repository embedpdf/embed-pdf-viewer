---
'@embedpdf/engine-core': minor
---

`page.text.objects()` reads a page as its content stream draws it: every page object in content order, form XObjects flattened in place, each with its marked-content stack (tags and MCIDs, one entry per sequence), and for text objects the font (base name, flags, ascent, descent, fixed pitch, serif), the font size, the matrix and the glyphs in drawing order. Values are in PDF user space. It needs `doc.text.copy`. `runPageTextObjectsConformance` checks it on `PAGE_TEXT_OBJECTS_FIXTURE_PDF`. The cloud engine rejects it with `NotImplemented` for now.
