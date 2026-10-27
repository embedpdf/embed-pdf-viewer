# @embedpdf/plugin-view-manager

## 3.0.0-next.17

### Minor Changes

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – A named type for the state: `ViewManagerState`, what `viewManagerState` reads and `useViewManagerState()` returns, the State table of the Several documents page with a comment on each field. Published types now name it instead of spelling out its fields. The plugin's model, from `/internal` and `/contract/host`, is now `ViewManagerModel`, made by `initialViewManagerModel()`, so `ViewManagerState` has one meaning.

## 3.0.0-next.16

## 3.0.0-next.15

### Minor Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Pane changes are named state transitions and the pane events are derived from them. The `/internal` entry is removed.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – The view-manager plugin now follows the 3.0 public contract and speaks in panes: `listPanes` / `getPane` / `getPaneOrder` / `getFocusedPaneId` / `getPaneOfDocument` replace `list` / `get` / `order` / `focusedViewId` / `documentView`; `createPane({ documentIds })`, `removePane(id, { moveDocumentsTo })`, `movePane`, `setFocusedPane` and the new `splitPane` replace `createView` / `removeView` / `moveView` / `setFocused`; `ViewInfo` is `PaneInfo`; the events `onPaneCreated` / `onPaneRemoved` / `onFocusChanged` / `onDocumentMoved` are new. The package gains a `./contract/host` entry.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `splitPane(documentId, { from? })` puts the new pane beside the focused pane, or beside `from`, instead of at the end. A document that gets its real id while it opens keeps its pane and its place in the tabs. `viewManagerState` declares the State table (`panes`, `focusedPaneId`) for the framework adapters. `onPaneCreated` and `onPaneRemoved` carry `PaneCreatedEvent` and `PaneRemovedEvent` (was `PaneEvent`), and the option types are named: `CreatePaneOptions`, `RemovePaneOptions`, `SplitPaneOptions`.

### Patch Changes

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Follows the documents contract (`getOrder`).

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The plugin's definition takes its types from its token, state and settings instead of type arguments. It declares no settings of its own, so its definition's settings type is `NoSettings`.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Enforce the one-pane-per-document partition: adding a document to a second pane moves it there instead of duplicating it.

## 3.0.0-next.14

## 3.0.0-next.13

## 3.0.0-next.12

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Publish a bundle-safe `/contract` entry for view-registry tokens, view state, and capability types without reducer or plugin wiring.

## 3.0.0-next.10

## 3.0.0-next.9

## 3.0.0-next.8

## 3.0.0-next.7

## 3.0.0-next.6

## 3.0.0-next.5

## 3.0.0-next.4

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces workspace-level document view management. It arranges open documents into reorderable panes while keeping each view associated with its own document scope and remaining independent of any UI framework.
