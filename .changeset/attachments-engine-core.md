---
'@embedpdf/engine-core': minor
---

Attachments are change ops: `attachments.create` (the file's name, type and description, its bytes as the `file` resource) and `attachments.delete`, each recorded with its reverse, so `doc.apply({ undoOf })` undoes and redoes them. An undo of a delete brings the same file back, with its bytes, description and dates, and publishes `attachments.restored`. `attachmentVerbs()` makes `doc.attachments.create()` and `delete()` one-op changes. `doc.attachments.download()` returns the bytes; the name and type are what the listing says, as for an annotation's `downloadResource(ref, 'file')`. `ATTACHMENT_LIMITS.decodedBytes` names the local engine's decode limit, and `AttachmentWireComponents` the attachment models. `wirePaths` no longer lists the attachment write routes; `wireTemplates` gains the current attachment reads.
