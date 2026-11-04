---
'@embedpdf/engine-core': patch
---

A dashed border whose `dashArray` is left out, on create or by an update that makes it dashed while it has no pattern, now states the default `[3, 3]` and reads it back, for every kind with a border and for widget placements. The pattern is written into the file because Acrobat redraws a dashed border whose file names none as a solid line. `dashArray: null` is no pattern: written as none, it reads back `null`. A write refuses an empty `dashArray`: an empty pattern is a solid line, which is `borderStyle: 'solid'`.
