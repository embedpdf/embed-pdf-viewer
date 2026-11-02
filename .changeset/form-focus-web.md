---
'@embedpdf/web': minor
---

The Stage keeps the pages where it put them when the browser scrolls inside it: a field reached with Tab, an element your code calls `focus()` or `scrollIntoView()` on, or the cursor at the edge of a text box now moves the Stage's view that far, instead of shifting the pages under it so the top of the document could no longer be reached. `bindFieldFocus()` binds a form field's box to the form's cursor: `focus()` and `focusNext()` put the cursor in its control, Tab and Shift+Tab go through the form in the document's order, and the arrow keys move between a radio group's buttons.
