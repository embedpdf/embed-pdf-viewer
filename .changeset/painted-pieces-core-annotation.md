---
'@embedpdf/core-annotation': minor
---

What an annotation paints is described once, as simple pieces (`PaintedPiece`: ink along a path, a filled polygon, an ellipse). Each shape family says what it paints with `ShapeFamily.painted`, which replaces `ShapeFamily.hit`; `paintedOf(record, view)` adds a measurement's caption and lines. Two questions are asked of the pieces: `paintedNear(pieces, point, margin)` for a click, and `paintedTouches(pieces, rect)` for a rectangle. A rectangle of no size touches exactly what a click with no margin hits. `geomHit` keeps its signature and reads the pieces; `geomPainted` gives them.

Clicks hit what they hit before, with two exceptions. A cloudy border is hit on its curves: the outer tips of its bumps hit, and the gaps between them don't. The margin around a text box, a caret or a measurement's caption now reaches the same distance in every direction, so its corners are rounded. `distanceHit` and `cloudyBorderExtent` are gone; use `paintedNear(distancePainted(layout, strokeWidth), point, margin)` and `cloudyBounds`.
