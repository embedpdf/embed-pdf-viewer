---
'@embedpdf/viewer-chrome': patch
---

The default bars make room in the order their groups say, now that a group's `importance` is its items' too. In a narrow main bar, pan and pointer are the first buttons to go into the "More" menu, then the View menu and zoom, and the document menu, thumbnails, search and comments never do. So a phone keeps the mode tabs, folded behind a chevron, beside search and comments. In the annotate, shapes and form bars, the text tools, polygons and the less common fields go before undo and redo. The measuring tools, and delete in the annotation bar, stay in their bars. An item you add with `layout.add(item, { group })` takes that group's importance unless you give it its own.
