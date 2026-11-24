---
'@embedpdf/engine-services': minor
---

Draw a PNG or a JPEG into a signature field, and take a mark out again. A mark was read as a PDF only, so an image failed with `the appearance PDF could not be opened`, for `forms.setSignatureAppearance` and for a signing's `appearance`. An image passed as its bytes is now drawn at its own size and fitted whole into the field's box, as a PDF mark is, upright in a turned field. It becomes a page the same way a stamp's image does. A mark passed as `{ pdf }` is read as a PDF only, as before.

`forms.setSignatureAppearance` with no mark (`null`) takes out a mark that was drawn in without signing: the widget reads `hasMark: false` again, draws the field's box in its style, and its style can change. Undo brings the mark back. A widget with no mark is left as it is, and a signed field is refused as before.
