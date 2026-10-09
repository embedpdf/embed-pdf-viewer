---
'@embedpdf/engine-core': minor
---

Widgets turn. A widget reads like every kind that turns: `box` (the frame its contents are laid out in), `rotation` (a clockwise quarter turn, `/MK /R`; `null` upright) and `rect` (where it stands, worked out). A placement takes `rotation` and its `rect` or its `box` (`placedWidgetOf` works out the rect; with both, `box` is the shape); an update takes `box`, `rotation` or `rect`. Every kind that turns as a box (square, circle, free text, stamp, caret, widget) can be created by its `rect` with a quarter turn instead of its `box` (`rect` at another angle is refused), and an update's `rect` now resizes a box at a quarter turn along its own sides. New `quarterTurnOf()`, `pdfQuarterTurnBox()`, `PlacedDraft`; `pdfRectTurnedBounds()` is exact at quarter turns; a create's `rect` is typed as a box. New conformance suite `runWidgetRotationConformance` with `TURNED_FIELDS_PDF`; the rotation suite covers create by `rect`.
