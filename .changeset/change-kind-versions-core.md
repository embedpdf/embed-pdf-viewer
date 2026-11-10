---
'@embedpdf/core': patch
---

The page list is read again when the event stream skipped events (`stream.desynced`). A page inserted or deleted by someone else while a viewer was too far behind used to show only after the document was opened again.
