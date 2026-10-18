---
'@embedpdf/plugin-outline': minor
---

New plugin: the document's outline (its bookmarks). `outlinePlugin()` mirrors the outline from the engine, reading it when something asks (`ensureLoaded()`, or reading `outlineState`), and shows this session's pending edits at once. It keeps which items are expanded (starting from the items the file opens) and which are selected, lists the rows a tree view shows (`listRows()`), names the item for where the view is reading (`getCurrentItem()`), and follows an item as a click does (`activate()`). `create`, `update`, `move` and `delete` are each one undoable change; a new item goes to the place in view and takes the selected text, or "Untitled" in the viewer's language, as its title. `canEdit()` answers whether the session may change the outline.
