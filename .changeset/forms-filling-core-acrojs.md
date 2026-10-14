---
'@embedpdf/core-acrojs': patch
---

- A script reads a field's `display` as its first widget shows (`hidden`, `noPrint`, `noView` or `visible`), as Acrobat's `field.display` does. Every field read as visible, so a script that showed a hidden field changed nothing.
