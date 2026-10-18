---
'@embedpdf/viewer-chrome': minor
---

The Outline panel shows the document's bookmarks as a tree, beside Thumbnails, for every document (one without an outline says so). A row goes where its item goes; the item for where you are reading is marked and scrolls into view; a filter finds items by their title, in their place; the keyboard works the tree as the ARIA tree pattern does. A session that may change the outline adds items (`Mod+B`, after the selected one, at the place in view, renaming at once), renames them in their row, drags them to another place and level, deletes them, and edits an item's title, colour, style, open state and destination in its Properties. Each edit is one step of the history. The new `outline:*` commands and the `outline-item` menu are in the layout, and `outline.editing` is a feature `readOnly` turns off. The page number field gives focus back to the number in the same frame it closes.
