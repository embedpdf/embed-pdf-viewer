---
'@cloudpdf/server': minor
---

Check the caller's authority over an annotation inside the engine's write for updates and deletes, instead of reading the page first: the check and the write see the same document, and each request makes one engine call. The engine checks an update's patch against its annotation's kind.

Page flatten and redaction apply fail as a whole when a page fails, leaving the document unchanged; their responses no longer list `'failed'` or `'skipped'` pages.

Address annotations as `:annotKey` = `obj:N` or `base:N` on every annotation route; remove the weak annotation session routes, the `index` update and delete route, page revision tokens and the weak annotation columns (migration `031`). Manifest pages are `{ page, cache }`, and annotation reads and write results carry `PageRef`s.

`ObjectNumberUnavailable` and `LayerFull` answer HTTP 409.
