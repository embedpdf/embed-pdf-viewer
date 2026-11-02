---
'@embedpdf/plugin-annotation': minor
---

With the fonts plugin installed, a free text box being typed in is drawn in the font programs the engine will write it with. The box is resolved when the edit starts, and again after a pause once its text has a character it wasn't resolved with, so a box whose font can't draw it moves to the font the engine moves it to. A `TextItem` carries its body `face` and the `programs` to mount, and `css.fontFamily` names them. `getCssFontFamily(face, id)` takes a run's whole face and the box, and `getFamilyOfCss(cssFamily)` reads a drawn family back. A document's own fonts map to and from their faces like registered ones.
