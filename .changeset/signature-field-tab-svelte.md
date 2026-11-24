---
'@embedpdf/svelte': patch
---

Let Tab get past a signature field in `<FormLayer>` when the signature plugin isn't registered. The field is only its picture then, with nothing to focus, but Tab still went for it: the press was taken, the cursor stayed in the field before it, and the fields after it could not be reached with the keyboard. Tab and Shift+Tab now pass over it, and so do `focus()` and `focusNext()`. The same holds for a box drawn by a control of your own that has no element Tab stops at. With the signature plugin the field is a stop, as before.
