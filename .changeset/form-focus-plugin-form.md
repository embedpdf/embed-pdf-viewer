---
'@embedpdf/plugin-form': minor
---

Move the cursor between fields. `focus(ref, { select })` brings a field into view, on whatever page it is, and puts the cursor in it; `focusNext({ backward, empty, wrap, from })` moves on as Tab does. Tab and Shift+Tab follow the document's order from page to page, including pages that aren't on screen, using each page's own tab order (rows, columns, or its annotations' order), skipping fields the user can't fill in, with a radio group as one stop whose buttons the arrow keys pick between. `getFocusedField()`, the `focusedField` state and `onFocusChanged` tell you which field the cursor is in. A script's `field.setFocus()` puts the cursor in that field.
