---
'@embedpdf/engine-runtime': patch
---

Renders runs of repeated paths faster with byte-identical output: a small path drawn again with the same points, drawing state and target reuses the coverage the rasterizer computed for it, and each repeat is still composited in order. Consecutive identical paths in a content stream now share one geometry. On a CAD plot of six million strokes a full-page render takes about 30% less time and the parsed page about 14% less memory.
