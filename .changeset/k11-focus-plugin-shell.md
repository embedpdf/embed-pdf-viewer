---
'@embedpdf/plugin-shell': minor
---

`open(id, { focus: true })` and `toggle(id, { focus: true })` ask for the cursor: each raises the surface's `focusRequest` by one, also when it is open already, and closing it sets the request back to 0. The element that follows the request takes focus (the framework packages' surface-focus hooks); a plain open never moves the cursor. `focusRequest` is a moment, not state to keep: `getSnapshot()` leaves it out, and `applySnapshot()` starts every surface at 0.
