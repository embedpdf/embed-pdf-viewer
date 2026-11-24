---
'@embedpdf/web': minor
---

Show a form field in its group's color.

- `EPDF_VARIABLES` gains `form-field-tint` (`--epdf-form-field-tint`, the setting `form.fields.tint`).
- `widgetBoxStyleOf()` and `listBoxStyleOf()` take a widget's `accent`, `{ color, strength }`, and add its fill and its edge. A widget without one is styled as before.
- New: `fieldTintOf(accent)`, the fill and the edge of a group's color, `recordAccentStyleOf(accent)`, the style of a lent record's accent in the annotation layer, and the type `FieldAccent`.
