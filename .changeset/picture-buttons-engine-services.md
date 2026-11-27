---
'@embedpdf/engine-services': minor
---

A push button holds an image, and a mark in a signature field is stored once however many fields show it.

- `forms.setButtonImage` puts an image (a PNG, a JPEG or a one-page PDF) in every widget of a push button as its icon (`/MK /I`) and draws each widget again from it, or takes it out. A widget's `layout` (`/MK /TP`) is read and written; a push button reads `hasImage`.
- A mark drawn into a signature field, signed or not, is now a drawing the document holds once, as a stamp's picture is: the same picture in ten fields saves as one image, not ten. A file saved before reads as it did, and its marks are found again when the same picture is placed.
- `forms.addWidget` on a push button that holds an image gives the new widget the same drawing as its icon; its `layout` is the placement's.
- A copy with its values keeps a push button's image, a form export carries it as the widget's `image` resource (except for a field marked `noExport`), and an import places it.
- A signing that names no lock locks a field anyone fills in once it holds an image, as it does one that holds text.
