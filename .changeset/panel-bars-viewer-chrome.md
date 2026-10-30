---
'@embedpdf/viewer-chrome': minor
---

The rows of buttons at the top of the thumbnails, outline and attachments panels are bars of the layout, named after their panel: `thumbnails` (groups `edit`, `more`, `history`), `outline` (`filter`, `items`) and `attachments` (`count`, `files`). They fit the panel's width like any bar, with what doesn't fit in a "More" menu, so a narrow panel no longer cuts off undo and redo, and `add`, `remove` and `replace` change them. The thumbnails bar also has insert from a file, duplicate and extract where there's room, in place of the page menu's button. The outline's filter and the attachments' count are `{ custom: 'outline-filter' }` and `{ custom: 'attachments-count' }`. Any panel, your own too, draws the bars placed in it with `place: { panel: id }`.
