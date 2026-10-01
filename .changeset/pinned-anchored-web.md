---
'@embedpdf/web': minor
---

Anchored placement lines up with a side's start or end (`'top-start'`, `'top-end'`, `'right-start'` and so on), takes a negative `gap` to overlap the box, and can be `pinned`: it then stays where it's put, with no flipping and no moving to stay in view. `projectAnchoredTarget` takes its options as one object (`{ placement, gap, pinned }`) and returns `null` once the box is too far out of view for the UI to reach into it; a `ViewProjector` reports its visible area with `view()`. An anchor can carry `boundsIn(view)` for a box that depends on the view, such as a note that keeps its size on screen.
