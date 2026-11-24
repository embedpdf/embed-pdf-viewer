---
'@cloudpdf/engine': minor
---

`doc.forms.setSignatureAppearance()` and `doc.signatures.prepare()` take a PNG or a JPEG as the mark, as a `Uint8Array` or a `Blob`, beside a one-page PDF: pass the bytes themselves. `doc.forms.setSignatureAppearance(field, null)` takes a drawn mark out. `{ pdf }` works as before, for a one-page PDF only: an image under it is refused before anything is sent.

An image and `null` need a server of version 3.4. An older one is never sent them: the call fails with `NotImplemented`, and `details.needs` and `details.serverVersion` say which side to update. A one-page PDF works against it.
