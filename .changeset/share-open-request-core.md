---
'@embedpdf/core': minor
---

A ready document whose share link asks for a passphrase or answers it got after the document opened shows them as `shareRequest`, as a document waiting to open does, and `documents.retry(id, { sharePassword })` or `retry(id, { visitor })` lets it go on as the same visitor instead of opening it again.
