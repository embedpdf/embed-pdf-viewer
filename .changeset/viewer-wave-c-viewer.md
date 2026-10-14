---
'@embedpdf/viewer': minor
---

Toolbars go anywhere the layout puts them: vertical bars along the left and right edges (`place: 'start'` or `'end'`, swapped in a right-to-left language), several bars on one edge in order, and bars floating over the pages (`place: { float: 'bottom-end' }` and the other seven positions). The page number floats at the bottom of the pages as the `pager` bar, and pressing it lets you type the page to go to. The document tabs now show only while more than one document is open; `layout.tabs('always')` brings back a tab for a single document.

`onReady` and `onDocumentChange` are config keys, read once like the others: `onReady` gets the `viewer` once it's live, and `onDocumentChange` gets the active document's id whenever it changes, the first one included, and `null` once the last one closes. The element's `epdf:ready` and `epdf:documentchange` fire at the same moments, each just before its callback; `epdf:ready` now comes before the first `epdf:documentchange`.

`@embedpdf/plugin-history` is listed as a dependency: the viewer's undo and redo use it.
