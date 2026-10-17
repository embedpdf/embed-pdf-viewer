---
'@embedpdf/core-annotation': minor
---

New records are named by the object numbers they take:

- The session holds object numbers for the records it creates next (`Session.objectNumbers`, replacing `seq` and `namePrefix`). A create takes the first, so a new record's ref and key are final from its first frame, and `refOf` returns it. `newRecordsAtMost(message)` says how many numbers a message may need; `update` refuses to make a record it can't name.
- Replace text is two `create` effects, the strikeout's draft answering the caret by the caret's number. The `createGroup` effect and the `rekey` message are gone.
- A stamp that fits its drawing `contain` keeps its raster's proportions in a resized box, as the engine draws it.
- `annotationOfNew(draft, { ref })` no longer takes the record's place on the page.
