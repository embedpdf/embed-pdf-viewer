---
'@cloudpdf/contract': minor
---

`doc.changes` takes the page ops under `doc.pages.assemble`, with a PDF to insert as a multipart part. The operations `doc.pages.reorder`, `doc.pages.rotate`, `doc.pages.delete`, `doc.pages.insert` and `doc.pages.insertBlank` are removed: page edits are changes.
