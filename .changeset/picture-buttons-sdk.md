---
'@cloudpdf/sdk': minor
---

A push button's image and a widget's layout: `WidgetAnnotation`, `WidgetPlacement` and `WidgetPatch` have `layout` (`'caption'`, `'image'`, `'caption-below'`, `'caption-above'`, `'caption-right'`, `'caption-left'`, `'caption-over'`, or `null` for a widget that isn't a push button's), a push button's `FormField` has `hasImage`, and `ChangeOp` has `forms.setButtonImage` (`{ field, resources: { image } }`, the image's part key or `null`). They need a server of version 3.5.
