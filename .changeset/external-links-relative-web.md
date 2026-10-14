---
'@embedpdf/web': patch
---

A PDF link without a scheme no longer opens relative to the page around the viewer. An address starting with `//` or `www.` opens on https; any other, such as `/admin` or `page2.html`, is relative to the document and opens nothing (it used to open that path on the app's own site).
