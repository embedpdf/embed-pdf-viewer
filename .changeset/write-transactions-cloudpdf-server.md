---
'@cloudpdf/server': patch
---

Check the caller's authority over an annotation inside the engine's write for updates and deletes, instead of reading the page first: the check and the write see the same document, and each request makes one engine call. The engine checks an update's patch against its annotation's kind.
