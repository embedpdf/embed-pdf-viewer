---
'@embedpdf/engine-core': minor
---

A widget reads `hasMark`: `true` when it is a signature field's widget with a mark in it, because the field is signed or a mark was drawn in with `forms.setSignatureAppearance`. A new signature field's widget is predicted with its appearance (its box), and `WIDGET_STYLE_NAMES` lists the fields that make up a widget's style.
