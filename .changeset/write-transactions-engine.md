---
'@embedpdf/engine': minor
---

Make every document write all-or-nothing: a write that fails changes nothing.

Annotation updates and deletes no longer read the page before they write: the engine checks the caller's authority against the annotation, and against everything a delete takes with it, inside the write. A refusal names the annotations it refused.

Remove the `sessionKind` open option: every document opens as an immutable base with an editable layer.

`doc.pages.flatten()` and `doc.redaction.apply()` are all or nothing: when a page fails, or the call is cancelled, no page changes and the promise rejects with the error. Their results no longer have `'failed'` or `'skipped'` pages.

An annotation's ref no longer changes: an annotation the file stores inline is named `{ kind: 'baseIndex', page, baseIndex }` by the position it was born at, through every write, and every other annotation by its object number. The `index` and `nm` ref kinds, `identityQuality`, page revisions, `shouldRefetch`, weak edit sessions (`doc.annotations.beginEdit`) and the `InvalidReference` and `WeakAnnotationSessionConflict` errors are gone. `meta.changed` and the `annotations.deleted` event's `deleted` list `AnnotationRef`s.
