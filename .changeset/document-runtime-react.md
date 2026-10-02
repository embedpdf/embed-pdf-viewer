---
'@embedpdf/react': minor
---

The documents follow the four-hook pattern. `useDocuments()` is the documents API only, the in-scope view inside a `<DocumentScope>`, so `download()` without an id downloads the document in scope. `useDocument(select?)` gives the document a component talks to, with `hasUnsavedChanges`; `useDocumentsState(select?)` gives `{ documents, activeId }`; `useDocumentsEvent(pick, handler)` replaces `useDocumentEvent` and no longer subscribes again for an inline selector. `useDocumentStatus()` is gone: read `useDocument().status`.

`<DocumentGate>` takes `locked={(document) => …}` and `error={(document) => …}`, each given the document, and shows `fallback` otherwise until the document is ready. `usePageList()` is in `/runtime`, needs no Stage and returns the document's pages as an array.

`<Viewer>` takes `identity` and `scope`, the defaults for every document it opens (a document's own replace them; documents opened after a change use the new values), and `accent` and `page { background, shadow }`, which the Stage and `<PageView>` paint pages with through the `--epdf-page-*` variables. `useViewerSettings(select?)` reads them. `children` is optional.

The view manager's entry is `/view-manager` (was `/views`): `useViewManager()`, `useViewManagerState(select?)` (`{ panes, focusedPaneId }`) and `useViewManagerEvent()`; `usePanes()` is gone. `saveFile` and `mountWebFont` are exported from `/runtime`.
