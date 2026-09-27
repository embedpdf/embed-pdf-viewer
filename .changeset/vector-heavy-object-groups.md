---
'@embedpdf/engine-runtime': patch
---

Renders zoomed-in tiles of pages with many objects faster, with byte-identical output. A page or form with at least 1,024 objects keeps the bounds of each run of 128 consecutive objects, computed the first time a render shows at most half of it, and later renders pass over the runs that lie outside their clip instead of testing every object. Moving, adding or removing objects makes the runs out of date, and the next such render computes them again. On a CAD plot of six million strokes, finding what a deep-zoom tile draws drops from about 22 ms to 0.2 ms.
