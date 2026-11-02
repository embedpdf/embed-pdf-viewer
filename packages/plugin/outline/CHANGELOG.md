# @embedpdf/plugin-outline

## 3.0.0-next.20

## 3.0.0-next.19

## 3.0.0-next.18

## 3.0.0-next.17

### Minor Changes

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – A named type for the state: `OutlineState`, what `outlineState` reads and `useOutlineState()` returns, the State table of the outline page with a comment on each field. Published types now name it instead of spelling out its fields.

## 3.0.0-next.16

### Minor Changes

- [#885](https://github.com/embedpdf/embed-pdf-viewer/pull/885) by [@bobsingor](https://github.com/bobsingor) – New plugin: the document's outline (its bookmarks). `outlinePlugin()` mirrors the outline from the engine, reading it when something asks (`ensureLoaded()`, or reading `outlineState`), and shows this session's pending edits at once. It keeps which items are expanded (starting from the items the file opens) and which are selected, lists the rows a tree view shows (`listRows()`), names the item for where the view is reading (`getCurrentItem()`), and follows an item as a click does (`activate()`). `create`, `update`, `move` and `delete` are each one undoable change; a new item goes to the place in view and takes the selected text, or "Untitled" in the viewer's language, as its title. `canEdit()` answers whether the session may change the outline.

### Patch Changes

- [#890](https://github.com/embedpdf/embed-pdf-viewer/pull/890) by [@bobsingor](https://github.com/bobsingor) – The outline is read again when an undo brings pages back, so the items that go to them work again.
