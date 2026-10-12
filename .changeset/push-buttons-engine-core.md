---
'@embedpdf/engine-core': minor
---

Push buttons can be created: `PushButtonFieldDraft` (`family: 'pushbutton'`, widgets only) and `PushButtonFieldPatch` (the settings every field has). A widget's new `caption` (`/MK /CA`) is a push button's caption, read and written on its row, its placement and `updateWidget()`; every other widget reads `null`, and a caption written to one is refused. `SignatureFieldDraft` and `SignatureFieldPatch` are exported too.

A widget's appearance follows the rule every annotation does: a move keeps it (`rect` is translatable geometry), and so do the widget's field, family and actions (inert keys); only a change to its look draws it again.
