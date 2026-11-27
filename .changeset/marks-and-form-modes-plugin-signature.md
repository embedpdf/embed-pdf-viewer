---
'@embedpdf/plugin-signature': patch
---

A mark armed from a `signatures` library and clicked over another person's signature field now does nothing and stays armed, as over an image field that isn't theirs: one rule for both, a box whose fill control is `disabled` takes no mark. Before, it tried to sign the field, the write was refused and the console logged "placing the mark failed". A mark that goes into a field now returns the user to the tool they had before arming it, so the fields take input again.
