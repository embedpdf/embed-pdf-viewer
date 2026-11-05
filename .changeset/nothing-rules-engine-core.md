---
'@embedpdf/engine-core': minor
---

One spelling for "nothing" (naming.md, "Nothing: left out or `null`"):

- A destination always has its axes: `PageDestination`'s `x`, `y` and `zoom` (and `PdfDestination`'s `left`, `top` and `zoom`) are always there, `null` to keep the viewer's value, never left out.
- `DocumentActionsSnapshot.openDestination` is always there, `null` when the document has none.
- `CommentThreadReview.mine` is always there: `null` when the reviewer has none, or when no `currentUserId` was given.
- An annotation create's `groupId: null` is no group, refused to a caller who has one; left out is still the caller's own group. It used to put the annotation in the caller's group.
- A free text's new rich text replaces the body whole when it gives one (what it leaves out takes the default, as on a comment), and keeps the current body when it doesn't. A partial body used to merge over the current one.
- An annotation create left without `nm` still gets a fresh name; `nm: null` now writes none, as a file from a tool that names nothing reads. It used to mint one too. A copy leaves `nm` out.
- A widget's `fontFamily`, `fontSize` and `fontColor` take values only: a font can't be removed, so `null` is only the read sent back (no font on the widget or the form), and is refused beside a font. It used to write Helvetica 12 black.
- A line's `captionEnabled` reads `false` without `/Cap`, the PDF's default, and takes no `null`. A polygon's and polyline's keep `null` for no caption and no placement.
- `OpenOptions.password` is `string`, left out for none.
- `LineCaptionPatch` and `ShapeCaptionPatch`, unused, are gone.
