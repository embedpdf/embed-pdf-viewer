---
'@cloudpdf/contract': minor
---

A push button's image and a widget's layout.

- `WidgetAnnotation` has `layout`: `'caption'`, `'image'`, `'caption-below'`, `'caption-above'`, `'caption-right'`, `'caption-left'` or `'caption-over'` for a push button's widget, `null` for any other. `WidgetPlacement` and `WidgetPatch` take it.
- A push button's `FormField` has `hasImage`.
- `doc.changes` has the op `forms.setButtonImage`: `{ field, resources: { image } }`, the image's part key (a PNG, a JPEG or a one-page PDF), or `null` to take it out. Its item is the field as it is now, with its widgets.
- A form bundle's widget names a push button's image as its `image` resource.

All of it arrives in 3.5. A server older than that refuses a placement or a patch that names `layout`, and the op `forms.setButtonImage`, so a client sends them only to a server that has them.
