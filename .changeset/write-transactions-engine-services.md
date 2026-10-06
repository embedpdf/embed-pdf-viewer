---
'@embedpdf/engine-services': minor
---

Run every document write as one layer transaction. A write that fails leaves the document, its page revisions and its derived caches as they were; a commit that fails makes the session refuse later jobs with `DocNotOpen` until the document is opened again.

Annotation updates, deletes and reorders find their annotations without loading the page, so none parses the page's content. A write that moves entries of a page's annotation list (a delete, a reorder, a flatten, a redaction, a merged form field's split) first turns the page's inline annotations into objects in place. Annotation updates and deletes check the caller's authority against what the write finds.

Remove plain (non-layer) sessions and checkpoint rollback.
