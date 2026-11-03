---
'@embedpdf/engine-core': minor
---

A square, circle, polygon, polyline, line or ink annotation takes `color: null` for no stroke, and keeps its `strokeWidth`. A shape whose file gives it no stroke color reads `color: null`. `runNoStrokeConformance` and `NO_STROKE_FIXTURE_PDF` check both engines read, write and draw it as Acrobat does.
