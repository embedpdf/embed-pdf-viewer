---
'@embedpdf/plugin-stamp': minor
---

The stamp verbs follow the contract every plugin shares. The placing verbs act on the document in scope, else the active one, or the one their options name: `armAsset(assetId, { targetWidth?, documentId? })`, `placeAsset(assetId, placement, { documentId? })`, `placeAssetOnPages(assetId, pages, placement, { documentId? })`, `createAssetFromAnnotations(page, refs, input, { documentId? })`, and `disarm(documentId?)`, `getArmedAsset(documentId?)`, `canPlace(documentId?)` (was a `documentId` first). A placing verb refuses with `permission-denied` (`error.permission: 'annotations:create'`) where `canPlace()` is false.

Create and update verbs resolve what they made: `createLibrary`, `updateLibrary` and `importLibrary` resolve `{ library }`; `createAsset`, `createAssetFromAnnotations`, `updateAsset`, `moveAsset` and `duplicateAsset` resolve `{ asset }`; `placeAsset` resolves `{ annotation }`, and `placeAssetOnPages` the placed annotations. A page argument is a ref or an index, and a page that isn't there refuses the call before anything is placed. Every async verb takes a `signal`: cancelled, it rejects `operation-cancelled` and keeps nothing.

`canCreateFromAnnotations()` is new: making a stamp from annotations copies them out, so it needs `doc.download`. `onArmChanged` carries `{ documentId, asset }` (was `assetId`), and fires whenever the armed stamp changes, also when the annotation plugin drops it. The event payloads are named after their events (`StampLibraryChangedEvent`, `StampLibraryCreatedEvent`, `StampAssetDeletedEvent`, …). `stampState` declares the state (`armedAsset`).

The settings are live: `assetEngine`, `previewWidth` and `dynamic` are read through `getSettings()`, changed with `updateSettings()` and `resetSettings()`, and announced by `onSettingsChanged` (`STAMP_DEFAULTS`). A new `assetEngine` is used from the next library operation on.
