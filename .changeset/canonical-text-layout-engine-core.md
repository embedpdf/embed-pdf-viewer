---
'@embedpdf/engine-core': minor
---

Add the canonical affine-aware text layout engine under `text/layout`: `buildPageTextLayout`, `textGlyphAt`, `expandTextRangeToWord`/`Line`, `textGlyphQuad`, and `textSegmentsForRange`, producing `PdfTextSegment { quad, rect, advance }`.

Orientation frames are derived from the semantic edges of glyph quads and keyed by baseline direction and ascent handedness. Rotated and mirrored text become upright inside their frame, while shear remains an in-frame variation so mixed roman and italic text stays in one segment. Every run in a cluster uses the same canonical frame, and upright documents retain a byte-identical fast path.
