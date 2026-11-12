---
'@embedpdf/engine-core': minor
'@embedpdf/engine-services': minor
---

Ink annotations take an optional `appearance` resource: a one-page PDF drawn as the normal appearance, fitted into `/Rect`, in place of the straight segments the generator joins `/InkList` points with. A viewer that smooths strokes into Bézier curves can now keep that look in the saved file.
