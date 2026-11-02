---
'@cloudpdf/viewer': minor
---

The CloudPDF viewer includes screenshot protection: for a user who may see a document's pages only as protected video (`protected-display.view`, without `doc.render`), they show that way, from the protected display server module. `viewer.get('protectedDisplay').getStatus()` says whether they do. Nothing changes for anyone else, and the video player is loaded only for a protected user.
