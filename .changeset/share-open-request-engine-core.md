---
'@embedpdf/engine-core': minor
---

`DocumentShare` gets `openRequest`, `onOpenRequest()` and `resume()`: a passphrase, or questions asked on open, that a share link gets while a document is open are asked of the visitor, and `resume({ sharePassword })` or `resume({ visitor })` lets the document go on as the same visitor. `ShareOpenRequest` and `shareOpenRequestOf()` move here from `@embedpdf/core`, which re-exports the type.
