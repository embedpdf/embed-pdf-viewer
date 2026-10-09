---
'@embedpdf/engine-services': minor
---

A widget's turn is read from and written to `/MK /R` (counterclockwise in the file, clockwise in the API), its box worked out from `/Rect`. A placement's `rotation` is written before the field adopts the widget, so its appearance is drawn turned; a placement turn that isn't a quarter turn is refused with `InvalidArg`. Box kinds' writers take the placed draft (`PlacedDraft`).
