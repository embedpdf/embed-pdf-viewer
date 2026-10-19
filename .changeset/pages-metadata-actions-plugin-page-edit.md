---
'@embedpdf/plugin-page-edit': minor
---

A page argument is a `PageRef` or an index, in a verb's page list and in a placement (`{ after }`, `{ before }`): an index names the page at that position when the verb is called. The inserts (`insertBlank`, `insertFromBytes`, `insertFromDocument`, `duplicate`) resolve `{ pages }`, the new pages in order; `rotateBy`, `setRotation`, `move` and `delete` resolve nothing.

`canExtract()` answers whether pages may be copied out (`doc.download`): `extract()` and `duplicate()` need it, and `insertFromDocument()` needs it on the other document. Every verb refuses before it starts, with `error.permission` naming what is missing, `not-found` for a page the document doesn't have, and `invalid-input` for no pages or for deleting every page. Every verb takes a `signal`: an edit whose signal fired while it waited never starts, and one that fires while the engine works rejects `operation-cancelled` at once. `extract()` runs in order with the edits called before it.
