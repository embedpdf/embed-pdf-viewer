---
'@embedpdf/engine': minor
---

`doc.forms.setSignatureAppearance()` and `doc.signatures.prepare()` take a PNG or a JPEG as the mark, as a `Uint8Array` or a `Blob`, beside a one-page PDF: pass the bytes themselves. `doc.forms.setSignatureAppearance(field, null)` takes a drawn mark out, so the field shows its own box again and its style can change. `{ pdf }` works as before, for a one-page PDF only.
