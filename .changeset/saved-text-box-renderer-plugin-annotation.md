---
'@embedpdf/plugin-annotation': minor
---

New host read `getTextItem(ref, view?)`: one free text's text item (its runs, body style and box) in every state, saved and idle included. A renderer that draws a text box itself reads it, since no engine picture is drawn under its element. `listTextItems` is unchanged: it lists only the text boxes the layer draws as elements.
