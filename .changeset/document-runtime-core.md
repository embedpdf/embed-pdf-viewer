---
'@embedpdf/core': minor
---

The documents capability speaks the same language as the rest of the API. `open()` and `retry()` resolve `{ document }`, a `DocumentInfo` (`id`, `name`, `status`, `pageCount`, `hasUnsavedChanges`, and `passwordProvided` or `error` when it's locked or failed), and the same object is what `get(id)`, `getActive()` and `list()` return until one of its fields changes. `DocInfo` is now `DocumentInfo` and `DocStatus` is `DocumentStatus`; `LockedDocumentInfo` and `FailedDocumentInfo` name a locked and a failed document, and `onActiveChanged` carries a `DocumentActiveChangedEvent` (was `ActiveDocumentChangedEvent`). `docInfoEquals` and `docInfoListEquals` are gone: `list()` is the same array until one of its documents changes, so compare by reference.

`save()` and `saveLayer()` are `download(id?, { mode, signal })` and `downloadLayer(id?, { signal })`. A download refuses with `permission-denied` (and `error.permission` set to `doc.download`) before anything runs; `canDownload(id?)` and `canPrint(id?)` replace `allows()`. A download first settles what plugins hold back, then reads the file inside every `ctx.aroundDownload()` wrap a plugin registered: the actions plugin runs the document's own save actions there. `downloadLayer()` refuses `unsupported` on an engine that keeps layers itself.

New: `hasUnsavedChanges` and the `onUnsavedChangesChanged` event (`{ documentId, hasUnsavedChanges }`). A change to a local document sets it; a download that read every change clears it. It stays false on an engine that stores each change as it's made.

New: a `{ kind: 'url', url }` source, which the viewer downloads under the document's loading tab and stops when the tab closes. `open()` takes a `signal`, which closes a document still opening; `unlock(id, { password, signal })` and `retry(id, { signal })` take one too. Every verb rejects with `PluginError`.

`getPage(page, id?)` takes a `PageRef` or an index, and `getPageAt()` is gone. `get(id?)` reads the document in scope without an id.

The kernel has settings of its own, the viewer's: `identity` and `scope`, which every document opens with unless it has its own (which replace them), and `accent` and `page { background, shadow }`, which painted parts fall back to. `createKernel({ settings })` registers them, and the kernel has `getSettings()`, `updateSettings()`, `resetSettings()` and `onSettingsChanged`; an identity is replaced whole. `VIEWER_DEFAULTS`, `ViewerSettings` and `ViewerPageSettings` are exported, and so is `Identity`.

`documentState` and `documentsState` declare the documents' state (the document in scope; every document and the active one) for the framework adapters. A settings declaration may name `whole` settings, which a change replaces instead of merging into. The test context has `aroundDownload()` and `download(read)`.
