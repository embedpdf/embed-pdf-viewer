---
'@embedpdf/web': minor
---

Annotation and form widget pictures load the same way: `loadAppearanceUrls` keys each picture by its item and state, with the version of its item it shows; `shownAppearance(urls, key, state)` picks the one an item shows, and `bakedAppearanceOf` takes the state. `loadFieldPictureUrls`, `shownFieldPicture` and `FieldPicture` are removed. `pictureOrPainting` is the one rule that picks an item's picture or its live drawing. `createFontMounts` holds the faces a layer mounted, `svgShapesOf` passes a `glyphs` node's font program on to its `text` shape, and `fontProgramsOf(shapes)` lists the faces shapes draw their text in, and `textFieldEditorStyleOf` takes the engine's layout of the text being typed (`TextEditorLayout`).
