---
'@embedpdf/engine-services': minor
---

Attachment ops apply inside changes, with their reverses: a delete keeps the file so its undo puts it back under its name, and undoing an add leaves a file someone put under that name since, even with the same bytes. The `attachments.create` and `attachments.delete` worker jobs are removed. A decode refused past its limit names the limit (`details.limit`).
