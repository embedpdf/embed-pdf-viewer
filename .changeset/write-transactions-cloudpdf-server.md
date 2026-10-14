---
'@cloudpdf/server': minor
---

Check the caller's authority over an annotation inside the engine's write for updates and deletes, instead of reading the page first: the check and the write see the same document, and each request makes one engine call. The engine checks an update's patch against its annotation's kind.

Page flatten and redaction apply fail as a whole when a page fails, leaving the document unchanged; their responses no longer list `'failed'` or `'skipped'` pages.

Address annotations as `:annotKey` = `obj:N` or `base:N` on every annotation route; remove the weak annotation session routes, the `index` update and delete route, page revision tokens and the weak annotation columns (migration `031`). Manifest pages are `{ page, cache }`, and annotation reads and write results carry `PageRef`s.

`ObjectNumberUnavailable` and `LayerFull` answer HTTP 409.

Hand object numbers to editing sessions (migration `032`). An editing session is the client's `X-Engine-Session-Id` together with the token's subject, and lives 15 minutes past its last sign of life. `/access` opens one for a caller that may create and hands it numbers (the body's `objectNumbers`, the response's `edit`); a write tops it up when asked with `EmbedPDF-Reserve-Object-Numbers` and answers `EmbedPDF-Object-Numbers`; `POST /v1/docs/:docId/layers/:layerName/object-numbers` reserves up to 1,000 at once; the event stream sends a `session` event and keeps the session alive. Creates name their numbers in the query string (`objectNumber`, `objectNumbers`, `widgetObjectNumbers`, `splitObjectNumber`), and a number the session doesn't hold is refused `not-held`. What a write makes for itself is numbered past every number handed out, and a publish drops the numbers handed out on its layer.

Every layer write route takes `Idempotency-Key`: a retry gets what the first request committed, and no numbers.
