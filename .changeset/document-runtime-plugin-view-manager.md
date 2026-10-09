---
'@embedpdf/plugin-view-manager': minor
---

`splitPane(documentId, { from? })` puts the new pane beside the focused pane, or beside `from`, instead of at the end. A document that gets its real id while it opens keeps its pane and its place in the tabs. `viewManagerState` declares the State table (`panes`, `focusedPaneId`) for the framework adapters. `onPaneCreated` and `onPaneRemoved` carry `PaneCreatedEvent` and `PaneRemovedEvent` (was `PaneEvent`), and the option types are named: `CreatePaneOptions`, `RemovePaneOptions`, `SplitPaneOptions`.
