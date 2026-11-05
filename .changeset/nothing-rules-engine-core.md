---
'@embedpdf/engine-core': minor
---

One spelling for "nothing" (naming.md, "Nothing: left out or `null`"):

- A destination always has its axes: `PageDestination`'s `x`, `y` and `zoom` (and `PdfDestination`'s `left`, `top` and `zoom`) are always there, `null` to keep the viewer's value, never left out.
- `DocumentActionsSnapshot.openDestination` is always there, `null` when the document has none.
- `CommentThreadReview.mine` is always there: `null` when the reviewer has none, or when no `currentUserId` was given.
- An annotation create's `groupId: null` is no group, refused to a caller who has one; left out is still the caller's own group. It used to put the annotation in the caller's group.
- A free text's new rich text replaces the body whole when it gives one (what it leaves out takes the default, as on a comment), and keeps the current body when it doesn't. A partial body used to merge over the current one.
- `OpenOptions.password` is `string`, left out for none.
- `LineCaptionPatch` and `ShapeCaptionPatch`, unused, are gone.
