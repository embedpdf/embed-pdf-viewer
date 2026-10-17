---
'@embedpdf/viewer-angular': minor
---

`documents` is an input of each door's `<epdf-pdf-viewer>`, typed by that door like `src`: entries of `{ src, name, password, active }`. `EpdfPdfViewerBase` no longer declares it, so a door of its own (such as CloudPDF's) names its documents in its own words.
