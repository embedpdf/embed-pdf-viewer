---
'@embedpdf/plugin-signature': minor
---

A mark whose `source` is a PNG or a JPEG works in a signature field. `fillField()`, `sign()`, `prepareSignature()` and `placeMark()` on a field failed with `the appearance PDF could not be opened` for an image, although a mark's `source` is a PNG, a JPEG or a one-page PDF; only a free placement took one. The `appearance` of `sign()` and `prepareSignature()`, given instead of the mark, takes a PNG or a JPEG as well, beside a one-page PDF.

`clearField()` now empties the field. It used to draw a blank page in, so the field kept reading as having a mark, showed nothing at all, and refused a change of its style. A cleared field shows its own box again, and undo brings the mark back.
