---
'@embedpdf/plugin-signature': minor
---

A mark armed from a `signatures` library and clicked over another person's signature field now does nothing and stays armed, as over an image field that isn't theirs: one rule for both, a box whose fill control is `disabled` takes no mark. Before, it tried to sign the field, the write was refused and the console logged "placing the mark failed". A mark that goes into a field now returns the user to the tool they had before arming it, so the fields take input again.

A mark armed from a `signatures` library shows what a click does while it hovers. Over a field it goes into, its preview sits in the field as the fill will draw it: fitted whole and centred, inside an image field's border, turned with a turned field. Over a field that isn't the user's there's no preview and the cursor is `not-allowed`. Anywhere else the preview follows the pointer, as before, when it used to vanish under the field's tint even over the field it fills.
