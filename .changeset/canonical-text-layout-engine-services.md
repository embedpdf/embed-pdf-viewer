---
'@embedpdf/engine-services': minor
---

Replace the parallel `rects[]` and `quads[]` geometry on `SearchMatch` with canonical `segments: PdfTextSegment[]`, validated by `PdfTextSegmentSchema`.

Search tokens now always encode `format=segments1`, preventing newer clients from consuming stale CDN-cached responses with the old geometry shape; old tokens fail decoding instead.
