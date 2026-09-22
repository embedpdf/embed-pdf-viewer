---
'@embedpdf/engine': patch
'@embedpdf/engine-services': patch
---

Widget records are built through `formWidget` everywhere the engine reads or echoes them, so `ref` is always present; attach and detach resolve the widget from its annotation address.
