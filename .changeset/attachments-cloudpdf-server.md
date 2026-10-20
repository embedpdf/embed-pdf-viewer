---
'@cloudpdf/server': minor
---

Attachments are changes: `POST …/changes` takes `attachments.create` (its file as a `resource:<key>` part) and `attachments.delete` under `doc.attachments.modify`, and undoes them by `opId`. The routes `POST …/attachments` and `DELETE …/attachments/{fileKey}` are removed, and file downloads no longer carry `X-EmbedPDF-File-Name` and `X-EmbedPDF-File-Type`: the listing has both. New current reads: `GET …/attachments`, `GET …/attachment-files/{fileKey}/data` and an annotation's `GET …/items/{annotKey}/resources/file`.
