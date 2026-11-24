---
'@embedpdf/web': minor
---

`bindFieldFocus()` tells the form whether a field's box takes the cursor, so Tab passes over one that holds nothing to focus instead of stopping there for good. A control of an app's own with no element that Tab stops at takes none, and `focusable: false` says the same for a box that is only the field's picture, as a signature field is without the signature plugin. Boxes that hold a control behave as before.
