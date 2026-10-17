---
'@embedpdf/engine': minor
---

Make every document write all-or-nothing: a write that fails changes nothing.

Annotation updates and deletes no longer read the page before they write: the engine checks the caller's authority against the annotation, and against everything a delete takes with it, inside the write. A refusal names the annotations it refused.

Remove the `sessionKind` open option: every document opens as an immutable base with an editable layer.

`doc.pages.flatten()` and `doc.redaction.apply()` are all or nothing: when a page fails, or the call is cancelled, no page changes and the promise rejects with the error. Their results no longer have `'failed'` or `'skipped'` pages.

An annotation's ref no longer changes: an annotation the file stores inline is named `{ kind: 'baseIndex', page, baseIndex }` by the position it was born at, through every write, and every other annotation by its object number. The `index` and `nm` ref kinds, `identityQuality`, page revisions, `shouldRefetch`, weak edit sessions (`doc.annotations.beginEdit`) and the `InvalidReference` and `WeakAnnotationSessionConflict` errors are gone. `meta.changed` and the `annotations.deleted` event's `deleted` list `AnnotationRef`s.

Every write takes its options last, with an `opId` that names the write; each event it fires carries it as `origin.tx`. A create's bytes go in the options: `page.annotations.create(data, { resources })` and `update(ref, patch, { resources })`.

Name a new annotation, page, field or widget before it exists: take a number from `doc.objectNumbers` and pass it as the create's `objectNumber` (`objectNumbers` for `pages.insertBlank`, `widgetObjectNumbers` and `splitObjectNumber` for forms). The ref is final at once. The pool holds 64 numbers from the moment the document opens and refills in the background; a number the session doesn't hold is refused with `ObjectNumberUnavailable`.

Writes apply in the order they are made, a create with bytes to read included: an update made right after a create runs after it.

Every annotation the engine creates without an `nm` gets a fresh UUIDv7 name, widgets included; a copy made by an import with `attribution: 'stamp'` gets a new one, so pasting onto the same page no longer drops a named annotation.
