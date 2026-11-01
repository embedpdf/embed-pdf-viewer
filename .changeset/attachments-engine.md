---
'@embedpdf/engine': minor
---

On the local engine, `doc.attachments.create()` and `delete()` are changes that can be undone, and a download of a file (an attachment, or an annotation's `file`) that decodes to more than 256 MB is refused with `PayloadTooLarge`, so a small compressed file can't take the tab down.
