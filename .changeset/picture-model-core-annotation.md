---
'@embedpdf/core-annotation': minor
---

`ModelAnnotation.apVersion` is now `pictureVersion`, and render items carry it (`RenderItem.pictureVersion`). A lent record can carry its lender's live drawing (`ModelAnnotation.painter`): a kind with no live drawing of its own (a form widget) then draws live while a gesture or a change reshapes or restyles it, as a square does, while its raster stays drawn where its shape is. Its item carries the drawing at the box the gesture has (`RenderItem.lentScene`), which `scene(item)` draws in place of the kind's own, and `hasLiveDrawing(item)` says whether an item can be drawn live now. A `glyphs` node carries the font program it draws in (`program`, a `SceneFontProgram`), for whatever draws it to mount.
