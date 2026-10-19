---
'@embedpdf/viewer-chrome': minor
---

Ctrl/Cmd+F is Find (`search:find`, with a search panel in the layout): it opens search with the cursor in its field and the text selected, and never closes it. It works from any text field in the viewer, the search field among them, so pressing it again selects the search text instead of opening the browser's find. The Search button puts the cursor in the field too (`panel:search` opens asking for focus), and an overlay or a sheet no longer takes focus from a field that took it as the panel opened. "Find" is in every language pack.
