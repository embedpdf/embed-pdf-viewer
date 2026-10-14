---
'@embedpdf/web': minor
---

`createSurfaceFocusFollower()` is the rule the surface-focus hooks share: an element takes focus when its surface's `focusRequest` changes to a new value above 0, and when it starts following while a request is up (a panel whose code loads on its first open); another document's shell starts over. `moveFocusInto(container, initialFocus?)` moves focus into a container unless it's there already, and `attachFocusTrap` uses it, so a field that took the cursor as its dialog opened keeps it. `containsFocus(container)` says whether focus is inside an element, through shadow roots and from a slotted element to its slot. `bindCommandShortcuts` passes `inTextField` to `matchStroke`, so a command that runs from text fields gets its key there.
