---
'@embedpdf/plugin-annotation': minor
---

Turn form fields in design mode. `selection.rotateBy()` and `selection.resetRotation()` now act on a selected field, which they skipped: a field turns by quarter turns and has no rotation handle. A selection of fields lists `orientation` among its properties, the direction their contents read in with each box staying where it stands; write it with the new `orientationPatch(annotation, rotation)`.

A field that another app turned was shown and moved as if it were upright. It now is a turned box like any other, with its picture where it stands; this is a fix, and nothing changes for a field that isn't turned.

`previewPlacement()` takes the page's display rotation, so the drag of an upright tool of another plugin is drawn as it will be placed.
