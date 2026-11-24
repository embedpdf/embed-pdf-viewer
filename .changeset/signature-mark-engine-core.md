---
'@embedpdf/engine-core': minor
---

A signature field's mark is a PNG, a JPEG or a one-page PDF, and it can be taken out again. `doc.forms.setSignatureAppearance(field, appearance)` and the `appearance` of `doc.signatures.prepare()` take the picture's bytes themselves, a `Uint8Array` or a `Blob`, in the formats a stamp's `appearance` resource takes; `SignatureAppearance` is their type. `setSignatureAppearance(field, null)` takes the mark out, and the change op `forms.setSignatureAppearance` takes `appearance: null` the same way. Bytes that are no PNG, JPEG or PDF are refused with `InvalidArg` before anything is sent. `{ pdf }` works as before and takes a one-page PDF only: an image under it is still refused.

On the wire, an image travels in the `appearance` part a PDF travels in, and the op's `resources.appearance` may be `null` for no mark (`FieldAppearanceResourceKeysSchema`). Both arrived in 3.4 (`MARK_IMAGE_OR_NONE_SINCE`). A `forms.setSignatureAppearance` worker request carries a mark passed as its bytes as `appearance`, and one passed as `{ pdf }` as `pdf`.
