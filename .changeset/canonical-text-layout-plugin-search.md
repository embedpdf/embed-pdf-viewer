---
'@embedpdf/plugin-search': minor
---

Represent search-hit geometry as canonical `segments: TextSegment[]` with a precomputed `bounds` envelope. Search reveal now passes that envelope directly to `stage.reveal(hit.pageIndex, { rect: hit.bounds })` instead of manually folding rectangles.
