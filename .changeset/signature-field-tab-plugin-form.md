---
'@embedpdf/plugin-form': minor
---

Let Tab get past a signature field that nothing can sign. Without the signature plugin a signature field is only its picture, but `focusNext()` and Tab still counted it as a stop: Tab was taken and the cursor stayed where it was, so the fields after it could not be reached with the keyboard. A box on screen whose control takes no cursor is now passed over by Tab, `focusNext()` and `focus()`, which returns `false` for it; one that comes into view with nothing to focus hands the cursor on to the next field. A focus target that a form layer lends through the host contract can say so with `takesCursor()`; a target without it takes the cursor, as before.
