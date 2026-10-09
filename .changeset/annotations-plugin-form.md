---
'@embedpdf/plugin-form': patch
---

The form tools register through the annotation plugin's `tools.register()`, read `tools.getDefaults()`, and select a placed widget with `selection.set()`.
