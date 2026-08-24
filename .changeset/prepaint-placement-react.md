---
'@embedpdf/react': patch
---

Bind Stage surface measurement before browser paint so the initial viewport and camera placement settle before page surfaces become visible. React viewers no longer show a transient incorrectly positioned page while a document opens.
