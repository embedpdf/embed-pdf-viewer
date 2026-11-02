---
'@embedpdf/web': patch
---

`attachFocusTrap` leaves focus where your code moved it as the trap is released: focus that lands
outside comes back a microtask later, unless the trap is released by then, and the release gives
focus back to where it was only from inside the trap or from nowhere. A click that closes a dialog
and puts the cursor in a field keeps it there.
