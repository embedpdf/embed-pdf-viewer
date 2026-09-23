---
'@embedpdf/engine-core': minor
---

Document events of this session's own mutations are published before the mutation's promise settles, in every engine; the document-events conformance suite checks it. `generateUuid` is exported for clients that tag a created annotation with its `/NM` before the engine confirms it. `positionKey(page, index)` is the key of the annotation at a position of a page's `/Annots` array, as a weak reference addresses it.
