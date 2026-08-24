---
'@embedpdf/plugin-stage': patch
---

Keep page and scrollbar screen geometry hidden until initial viewport placement commits. Stage consumers no longer receive origin-based placeholder geometry while viewport, responsive settings, and camera state are being initialized, preventing pages from rendering at the top-left before their final placement.
