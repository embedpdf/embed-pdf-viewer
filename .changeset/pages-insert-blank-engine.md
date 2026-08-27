---
'@embedpdf/engine': minor
---

Implement `pages.insertBlank` in the local document pages service. Blank-page
requests use the worker protocol, enforce the page-assembly capability, and
publish the resulting `pages.inserted` document event.
