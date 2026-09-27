---
'@embedpdf/engine-runtime': patch
---

Replays repeated paths one call sooner: the rasterizer's output for a path the content stream repeats is now recorded on its first repeat instead of its second, so every run of identical strokes rasterizes once less. A CAD plot of six million strokes renders about 6% faster, with byte-identical output.
