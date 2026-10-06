---
'@embedpdf/engine': minor
---

Make every document write all-or-nothing: a write that fails changes nothing.

Annotation updates and deletes no longer read the page before they write: the engine checks the caller's authority against the annotation, and against everything a delete takes with it, inside the write. A refusal names the annotations it refused.

Remove the `sessionKind` open option: every document opens as an immutable base with an editable layer.
