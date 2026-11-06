---
'@embedpdf/viewer-chrome': patch
---

The font picker no longer offers the Hebrew and Arabic fallback fonts the engine comes with: they fill in those characters whichever font a box is in. Your fonts (your server's, on the cloud) are still offered, and a box already in one of the fallback fonts still shows it.
