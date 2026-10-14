---
'@embedpdf/core-annotation': minor
---

One answer for what a create gesture makes. `gesturePlacement` places the dragged box or segment, or the tool's click default; `placedShape` lays the kind's shape there through the new `ShapeFamily.placed`. The commit, the drawing in progress and a tool's ghost all make these calls, and `unmadeItem` paints an annotation not made yet as the made one will. `clickCreateGeom` and `ClickPlacement` are gone (`Placement` replaces the latter), and free text no longer click-creates without a `clickCreate` policy.

A line's `ClickCreate` takes `anchor` (`'center'` by default, `'start'`, `'end'`) and `rotation` (degrees clockwise, replacing `angleDeg`), so a clicked line or arrow is centred on the pointer. Under `upright` a click is laid out as the person sees the page: a line points as seen, a centred box keeps its configured width × height and slides inside the page by what the page shows, and a square or circle takes a quarter turn as swapped sides instead of storing a turn. A radio button widget is its own kind, `widget-radio`, drawn round. Render items tell a drawing in progress (`source: 'draft'`) from a tool's ghost (`source: 'ghost'`, with `ghostOpacity`).
