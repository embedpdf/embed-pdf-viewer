---
'@embedpdf/engine-core': patch
---

A dashed border written without a pattern of its own, on create or by an update that makes it dashed or clears its pattern, now states the default `[3, 3]` and reads it back, for every kind with a border and for widget placements. The pattern is written into the file because Acrobat redraws a dashed border whose file names none as a solid line. A border from another app that names no pattern still reads `dashArray: null` and draws the default.
