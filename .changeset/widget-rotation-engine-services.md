---
'@embedpdf/engine-services': minor
---

A widget's turn is read from and written to `/MK /R` (counterclockwise in the file, clockwise in the API), its box worked out from `/Rect`. A placement, by its `rect` or its `box`, is resolved once (`placedWidgetOf`), and its `rotation` is written before the field adopts the widget, so its appearance is drawn turned; a placement turn that isn't a quarter turn, or one with no place, is refused with `InvalidArg`. Box kinds' writers take the placed draft (`PlacedDraft`).
