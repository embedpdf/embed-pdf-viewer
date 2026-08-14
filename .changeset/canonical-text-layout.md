---
'@embedpdf/engine-core': minor
'@embedpdf/engine-services': minor
'@embedpdf/plugin-selection': minor
'@embedpdf/plugin-search': minor
'@embedpdf/react': minor
---

One canonical text layout: selection and search now share a single affine-aware segmentation engine, and no geometry travels as parallel arrays.

- `@embedpdf/engine-core` gains `text/layout`: `buildPageTextLayout`, `textGlyphAt`, `expandTextRangeToWord`/`Line`, `textGlyphQuad`, and `textSegmentsForRange` producing `PdfTextSegment { quad, rect, advance }`. Orientation frames are derived from the semantic edges of glyph quads and keyed by (baseline direction, ascent handedness): rotated and mirrored text become upright inside their frame, shear (fake italic) is deliberately in-frame residue so a mixed roman/italic line stays ONE segment, and every run of a cluster is transformed through the same canonical frame. Upright documents take a byte-identical fast path.
- `SearchMatch` now carries `segments: PdfTextSegment[]` (the same canonical segmentation selection uses) instead of the `rects[]`/`quads[]` parallel arrays; `PdfTextSegmentSchema` validates the wire shape. Search tokens carry an always-encoded `format=segments1` marker so the response-shape change can never pair a newer client with a stale CDN-cached body — old tokens fail decode instead.
- `@embedpdf/plugin-selection` becomes a coordinate seam: gestures and state stay, segmentation is the engine layout. `SelectionSnapshot.pages` carries `segments` only (boxes are derived views via `segment.rect` / `rectsForPage()`); public geometry exports are now `buildSelectionPageGeometry`, `contentPointToPdf`, `toContentSegment`, and `toContentTextQuad`.
- `@embedpdf/plugin-search` hits carry `segments: TextSegment[]` plus a precomputed `bounds` envelope — `stage.reveal(hit.pageIndex, { rect: hit.bounds })` replaces manual rect folding.
- `@embedpdf/react` search and selection layers render canonical segments: axis-aligned lines keep their classic appearance, rotated lines draw their true oriented cells.
