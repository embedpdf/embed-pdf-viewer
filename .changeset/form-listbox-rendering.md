---
'@embedpdf/plugin-form': patch
---

Fix list box form widgets rendering unusably when the option count exceeds the widget height. Option rows now carry `flexShrink: 0`, so they keep their natural line height and the container scrolls instead of the flex column crushing all rows into the box. The overlay background now treats a missing or `transparent` annotation color as opaque white, so the widget's appearance-stream image no longer shows through and doubles the option text. Applied to both the interactive form-fill list box and the annotation-mode renderer.
