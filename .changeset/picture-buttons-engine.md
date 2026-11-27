---
'@embedpdf/engine': minor
---

`doc.forms.setButtonImage(field, image | null)` puts a PNG, a JPEG or a one-page PDF in every widget of a push button, or takes it out: an image field, as Acrobat makes one. A push button reads `hasImage`, and its widgets a `layout` (`'caption'`, `'image'`, `'caption-below'` and four more) that a create and `updateWidget()` write. It is filling in, one change with one undo step (the op `forms.setButtonImage`): a field anyone fills in takes any signer's image, and a signing locks it once it holds one. A field marked `noExport` exports without its image. A widget added later with `addWidget()` gets the field's image too, shown as its `layout` says. The change analysis counts the image as filling in, as Acrobat does: after an approval signature or a certification for form filling, `analyze()` reads it as `permitted`.

A picture shown in many places is stored once: a mark in ten signature fields now saves as one image, as ten stamps already did.
