---
'@embedpdf/plugin-annotation': patch
---

Fix marquee selection selecting non-rendered annotation types (e.g. POPUP, TEXT, WIDGET). Only annotations with a visual renderer are now included in marquee selection results.
