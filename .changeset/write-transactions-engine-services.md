---
'@embedpdf/engine-services': minor
---

Run every document write as one layer transaction. A write that fails leaves the document and its derived caches as they were; a commit that fails makes the session refuse later jobs with `DocNotOpen` until the document is opened again.

Annotation updates, deletes and reorders find their annotations without loading the page, so none parses the page's content. A write that moves entries of a page's annotation list (a delete, a reorder, a flatten, a redaction, a merged form field's split) first turns the page's inline annotations into objects in place. Annotation updates and deletes check the caller's authority against what the write finds.

Remove plain (non-layer) sessions and checkpoint rollback.

`pages.insertBlank` inserts each page without loading it.

Page flatten and redaction apply are all or nothing: a page that fails, or a cancel, rejects the call and leaves every page as it was, instead of keeping the pages before it.

Name every annotation for life: by its object number, or, for an annotation the file stores inline, by the position it was born at, which it keeps after the layer gives it an object number. Pages inserted into a layer hold only objects. The engine no longer writes an `/NM` into an annotation it changes, and keeps no page revisions.

Create objects at the object numbers a write names: annotations, blank pages, form fields, widgets and a merged field's split widget. A session that hands numbers out (`objectNumbers: 'session'`, the default) refuses a number it doesn't hold, spends the ones a write commits, and keeps them when it aborts; one the caller vouches for (`'caller'`) is created as asked. A write that would pass the highest object number a file should have is refused with `LayerFull`.

Name every annotation a create makes without an `nm` with a fresh UUIDv7, widgets included, and give the copies of a stamping import fresh names. `SessionEventPublisher.publishWrite(opId, ...events)` replaces `publishLocal`: every event of a write carries its `opId` as `origin.tx`.

A write request's `objectNumberFloor` raises the layer's last object number before the write, so what the write makes for itself is numbered from the floor. Opens, saved layer artifacts and a finalized signing candidate report the layer's last object number.
