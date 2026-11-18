---
'@embedpdf/plugin-annotation': minor
---

Turn form fields in design mode. `selection.rotateBy()` and `selection.resetRotation()` now act on a selected field, which they skipped: a field turns by quarter turns and has no rotation handle. A selection of fields lists `orientation` among its properties, the direction their contents read in with each box staying where it stands; write it with the new `orientationPatch(annotation, rotation)`.

A field that another app turned was shown and moved as if it were upright. It now is a turned box like any other, with its picture where it stands; this is a fix, and nothing changes for a field that isn't turned.

`previewPlacement()` takes the page's display rotation, so the drag of an upright tool of another plugin is drawn as it will be placed.

`selection.rotateBy()` and `selection.resetRotation()` keep what they turn on its page. A turn is about the middle, so a wide box near the top of its page stood past the edge once turned, and the next drag pulled it back. It now lands against the edge: moved the least that puts it on the page, with several annotations moving together. This holds for stamps and shapes as well as fields. Turning with the rotation handle is unchanged.
