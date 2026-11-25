# @embedpdf/plugin-history

## 3.4.0

## 3.3.0

### Minor Changes

- [#1091](https://github.com/embedpdf/embed-pdf-viewer/pull/1091) by [@bobsingor](https://github.com/bobsingor) – The history plugin ships undo and redo as commands: `createHistoryCommands()` makes the list of `history:undo` (`Mod+Z`) and `history:redo` (`Mod+Shift+Z`, `Mod+Y`). It comes from a new `@embedpdf/plugin-history/commands` entry. They stay disabled while there is nothing to undo or redo. The entry reads the plugin through its contract, so the list brings no plugin code with it. Each framework package has the list ready as `historyCommands`, and it is part of `standardCommands`.

## 3.2.0

## 3.1.0

## 3.0.0

### Major Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Introduces `@embedpdf/plugin-history`: undo and redo, one history per open document, of what this session changes through the viewer's plugins. `historyPlugin()` records every change the plugins stage on the document's change queue as it is staged, so an undo right after an action undoes it even while it is still on its way to the engine; the document shows it undone at once, and the engine undoes the change by reference. Typing into one text box is one step. `undo()`, `redo()`, `canUndo()`, `canRedo()`, `getUndoLabel()`, `getRedoLabel()` (`{ key: 'annotation.move', count: 3 }`), `clear()`, `historyState`, and the events `onUndone` (with how many parts someone else changed since, `skipped`) and `onUndoFailed` (`'unavailable'` or `'refused'`). A refused change leaves the history; a refused undo puts its step back; a redaction, flattening, signing, form repair or a new version clears it. The `limit` setting (default 100) caps the steps.

### Minor Changes

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – A named type for the state: `HistoryState`, what `historyState` reads and `useHistoryState()` returns, the State table of the history page with a comment on each field. Published types now name it instead of spelling out its fields.

### Patch Changes

- [#1000](https://github.com/embedpdf/embed-pdf-viewer/pull/1000) by [@bobsingor](https://github.com/bobsingor) – Follows core's `changes.listPending()`.

## 3.0.0-next.23

### Patch Changes

- [#1000](https://github.com/embedpdf/embed-pdf-viewer/pull/1000) by [@bobsingor](https://github.com/bobsingor) – Follows core's `changes.listPending()`.

## 3.0.0-next.22

## 3.0.0-next.21

## 3.0.0-next.20

## 3.0.0-next.19

## 3.0.0-next.18

## 3.0.0-next.17

### Minor Changes

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – A named type for the state: `HistoryState`, what `historyState` reads and `useHistoryState()` returns, the State table of the history page with a comment on each field. Published types now name it instead of spelling out its fields.

## 3.0.0-next.16

## 3.0.0-next.15

### Major Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Introduces `@embedpdf/plugin-history`: undo and redo, one history per open document, of what this session changes through the viewer's plugins. `historyPlugin()` records every change the plugins stage on the document's change queue as it is staged, so an undo right after an action undoes it even while it is still on its way to the engine; the document shows it undone at once, and the engine undoes the change by reference. Typing into one text box is one step. `undo()`, `redo()`, `canUndo()`, `canRedo()`, `getUndoLabel()`, `getRedoLabel()` (`{ key: 'annotation.move', count: 3 }`), `clear()`, `historyState`, and the events `onUndone` (with how many parts someone else changed since, `skipped`) and `onUndoFailed` (`'unavailable'` or `'refused'`). A refused change leaves the history; a refused undo puts its step back; a redaction, flattening, signing, form repair or a new version clears it. The `limit` setting (default 100) caps the steps.
