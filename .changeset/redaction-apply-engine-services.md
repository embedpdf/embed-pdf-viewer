---
'@embedpdf/engine-services': patch
---

`doc.redaction.apply({ annotations })` applies a page's marks in one pass: their regions are redacted together, so an image under several marks is read and written once, and the page's other redaction marks stay.
