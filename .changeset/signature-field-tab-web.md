---
'@embedpdf/web': minor
---

`bindFieldFocus()` tells the form whether a field's box takes the cursor, so Tab passes over one that holds nothing to focus instead of stopping there for good. A control of an app's own with no element that Tab stops at takes none, and `focusable: false` says the same for a box that is only the field's picture, as a signature field is without the signature plugin. In such a control an element that is hidden, disabled (also by a `<fieldset>`), inert or not drawn is no stop: the cursor goes to the first element that can take it, and the target's `focus()` answers whether it went in. The layer's own controls behave as before.
