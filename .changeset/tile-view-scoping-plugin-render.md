---
'@embedpdf/plugin-render': minor
---

Scope tile state by view and page so multiple views of the same page can plan rasters independently without invalidating each other. Replace the flat tile methods with a reference-stable `render.tilesFor(view)` handle that binds the view identity for planning, paint reporting, and release.
