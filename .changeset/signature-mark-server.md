---
'@cloudpdf/server': minor
---

A signature field's mark may be a PNG or a JPEG, beside a one-page PDF: the visual fill (`POST .../form/fields/{field}/signature-appearance`), a signing's `appearance` (`POST .../signatures/prepare`) and the change op `forms.setSignatureAppearance` refused an image part with `the appearance resource must be a PDF`. The visual fill and the change op also take `resources: { appearance: null }`, which takes a drawn mark out of the field.
