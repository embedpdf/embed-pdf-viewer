---
'@cloudpdf/server': minor
---

The change op `forms.setButtonImage` puts a push button's image in (its `image` part) or takes it out (`null`), and a widget's `layout` is read and written. The op `forms.addWidget` gives a push button's new widget the field's image. The change analysis counts a push button's image as filling in, as Acrobat does. A mark in a signature field is stored once however many fields show it. The `form` and `formExport` engine values are raised: their answers carry `hasImage`, `layout`, and a push button's image in a bundle.
