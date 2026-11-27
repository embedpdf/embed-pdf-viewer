---
'@cloudpdf/engine': minor
---

`doc.forms.setButtonImage(field, image | null)` puts a PNG, a JPEG or a one-page PDF in every widget of a push button, or takes it out, and the image travels as a part of the change, as a stamp's does. A push button reads `hasImage`, and its widgets a `layout` that a create, `addWidget()` and `updateWidget()` write.

Both need a server of version 3.5. An older one is never sent them: `setButtonImage()`, the op `forms.setButtonImage`, a write that names a `layout`, and an import of a bundle with a button that shows an image fail with `NotImplemented` before anything is sent, and `details.needs` and `details.serverVersion` say which side to update. Reading works against an older server: its push buttons read `hasImage: false`, and its widgets `layout: 'caption'` for a push button's and `null` for the rest.
