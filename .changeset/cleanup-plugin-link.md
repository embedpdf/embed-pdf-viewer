---
'@embedpdf/plugin-link': patch
---

Without the annotation plugin, loaded pages are re-read after a redaction or a flatten applied to them.

Link destinations and hit areas now use durable page references and page-space geometry, including links attached to annotations.
