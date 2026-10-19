---
'@embedpdf/viewer-chrome': minor
---

Pages are organized in the thumbnails panel, where the user may change them (`pages` feature, `doc.pages.assemble`).

- A click selects a page and goes to it; Ctrl/Cmd+click and Shift+click select more. Each page has a menu (its ⋯ button, a right-click or a long press) with rotate, insert a blank page or a PDF, duplicate, extract and delete. Dragging moves pages, with a line where they land; a PDF dropped between pages is inserted there instead of opening as a tab. The arrows, Shift, Space, Alt+arrows, Delete and Ctrl/Cmd+A work while the list has focus.
- The panel's header inserts a blank page, rotates and deletes the selection, opens its menu, and has undo and redo: every page edit is a step of the history.
- New commands: `page:rotate-clockwise`, `page:rotate-counterclockwise`, `page:delete`, `page:duplicate`, `page:insert-blank`, `page:insert-file` (`args: { position, files }`), `page:extract` (in `documents.download`, so `readOnly` keeps it), `page:select-all` and `menu:page`, with the `page` menu. New icons: `pageRotateClockwise`, `pageRotateCounterClockwise`, `filePlus`, `fileExport`. Their strings are in all 13 languages.
- Downloads of the document, a stamp library, a signature and a signed revision share one way of saving a file.
