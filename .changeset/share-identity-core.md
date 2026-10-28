---
'@embedpdf/core': patch
---

`documents.retry(id, { identity })` takes the visitor's answers to what a share link asks (was `{ visitor }`). They join who the page said the user is, the document's `identity` or else the viewer's, and the document opens again with that identity.
