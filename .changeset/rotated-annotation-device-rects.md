---
'@embedpdf/engines': patch
---

Fix annotation rectangles on rotated pages so `getPageAnnotations` returns the device-space rect that was created when the page `/Rotate` is 90, 180, or 270.
