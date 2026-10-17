---
'@embedpdf/viewer': minor
---

Ctrl/Cmd+F is Find (`search:find`): it opens search with the cursor in its field and the text selected, keeps it open, and works from any text field in the viewer, so pressing it again selects the search text instead of opening the browser's find. The Search button puts the cursor in the field too. `viewer.get('shell').open(id, { focus: true })` opens a panel asking for the cursor; a plain `open(id)` leaves it where it is.
