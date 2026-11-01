---
'@cloudpdf/engine': minor
---

On the cloud engine, `doc.attachments.create()` and `delete()` are changes that can be undone, sent through `POST …/changes`, and `download()` returns the bytes. Another session follows `attachments.restored`.
