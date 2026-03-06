---
'@embedpdf/plugin-redaction': patch
---

Remove redundant `onTouchStart` handlers from redaction renderers. `onPointerDown` already covers touch input on all modern browsers, so the duplicate handler caused non-passive event listener violations and double-fired on touch devices.
