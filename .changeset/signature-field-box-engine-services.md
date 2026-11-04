---
'@embedpdf/engine-services': minor
---

A signature field draws its box: placing one writes its background and border, and a restyle draws them again, as it does for a widget in no field. Once a mark is in the field (it is signed, or a mark was drawn in), the mark stays: a resize keeps it, and a style change is refused with `InvalidArg`. A mark drawn in records how it fits the widget, as a stamp records its own.
