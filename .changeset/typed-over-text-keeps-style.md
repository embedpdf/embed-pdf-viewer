---
'@embedpdf/plugin-annotation': patch
---

Text typed over a selection in a free text box keeps the style of the text it replaces, and a line break at the end of a styled run carries that run's style to the new line, when no style was chosen at the caret. Both came out in the box's own font, because the browser drops a selected word's style with it and starts a new line outside the run. Typing at a caret, with nothing selected, still takes nothing from the text next to it.
