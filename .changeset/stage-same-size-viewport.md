---
'@embedpdf/plugin-stage': patch
---

A viewport report of the size the stage already has is now a no-op. It used to count as a resize: it cancelled a navigation still animating and re-applied the old anchor, so a `reveal()` asked for as the view opened (before the ResizeObserver's first callback repeated the size) kept its zoom but never moved.
