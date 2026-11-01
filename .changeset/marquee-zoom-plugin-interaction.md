---
'@embedpdf/plugin-interaction': minor
---

A third built-in tool, `zoom`: drag a box to zoom to it, or click to zoom in a step (Alt-click zooms out), like Acrobat's Marquee Zoom. Its cursor is `zoom-in` on the pages and between them, one finger draws the box on a touch screen, and it neither follows links nor fills forms. The stage draws the box and does the zooming. `listTools()` now starts `['pointer', 'pan', 'zoom']`.
