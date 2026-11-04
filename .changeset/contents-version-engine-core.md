---
'@embedpdf/engine-core': minor
---

The manifest has `contentsVersion`, the document-wide pin of every page's content: it moves with any write that moves a page's `contentVersion`, inserts a page or deletes one, and a write's `cacheDelta` carries it when it moved. A search token pins `contentsVersion` and `layoutVersion` instead of `epoch`, and `searchContentEpoch` is gone.
