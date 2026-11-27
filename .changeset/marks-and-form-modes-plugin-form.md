---
'@embedpdf/plugin-form': minor
---

Design mode is now the form's own tools only: the widgets are lent to the annotation plugin while the active tool carries the new `form-design` tag, which `form-edit` and every field tool carry. Before, any tool that didn't fill forms (a stamp, a pen, a highlight, zoom) lent them to whoever may design, so a click with a stamp selected a field and showed its handles. A tool of an app's own that should design the form carries `form-design` too.

- Under any other tool that doesn't fill forms, the form layer shows the fields as it does while filling, with their tints, edges and placeholders, but they take no input and no pointer, so the tool works over them. The host lens says which with `getLayerMode()`: `'fill'`, `'design'` or `'show'`.
- A box's placeholder sits where its value will: `placeholderAlign` on every box says where. A text field and a dropdown keep their own alignment; a signature field and an image field centre it, where the mark and the picture go. A lent field's placeholder carries the same as `align`.
