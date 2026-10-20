# @embedpdf/plugin-stamp

## 3.0.0-next.16

## 3.0.0-next.15

### Minor Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `placeAsset()` and `placeAssetOnPages()` put the stamp's middle on `center` (was `at`) and take a page as a ref or an index; a placement from code is selected only with `select: true`. Arming and placing go through the annotation plugin's `stamps` (`arm`, `isArmed`, `place`, `disarm`).

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – The stamp contract, on the kernel's `create()` hook. Reads: `listLibraries(filter?)` (was `libraries`), `getLibrary`, `listAssets({ libraryId?, kind?, category? })` (was `assets(libraryId?)`), `getAsset`, `getAssetPreview` (was `assetPreview`), new `renderAssetPreview(id, { width })`, `readAssetBytes` (was `assetBytes`; returns a copy). Libraries: `deleteLibrary` (was `removeLibrary`), `importLibrary` (was `importLibraryPdf`), `exportLibrary` is async and rejects `not-found`. Assets: `createAsset` (was `addAsset`), `createAssetFromAnnotations` (was `addAssetFromAnnotations`), `deleteAsset` (was `removeAsset`), new `moveAsset` (copy to another library, then delete) and `duplicateAsset`. Placement: `getArmedAsset` (was `armedAsset`; pure), new `placeAssetOnPages` (a `BatchResult<AnnotationRef, PageRef>`), `canPlace`, `canImport`. Events: `onLibraryCreated`/`onLibraryUpdated`/`onLibraryDeleted`, `onAssetCreated`/`onAssetUpdated`/`onAssetDeleted`, `onArmChanged`, and `onLibraryChanged` (bytes changed — what persistence subscribes to). The PDF-convention helpers (`stampKey`, `stampPieceInfo`, the PieceInfo names, …) moved to `/internal`; `DEFAULT_LIBRARY_KIND` stays public. Refusals are `PluginError`s.
  - Internal layout: `contract` / `host-contract` / `model` / `controller` with `services`, `read` and `write` areas; `/internal` exports `createStampController` (was `createStampCapability`).

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – `addAssetFromAnnotations(documentId, page, refs, input)` takes a `PageRef`; `StampAsset.page` identifies the asset's library page.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The stamp verbs follow the contract every plugin shares. The placing verbs act on the document in scope, else the active one, or the one their options name: `armAsset(assetId, { targetWidth?, documentId? })`, `placeAsset(assetId, placement, { documentId? })`, `placeAssetOnPages(assetId, pages, placement, { documentId? })`, `createAssetFromAnnotations(page, refs, input, { documentId? })`, and `disarm(documentId?)`, `getArmedAsset(documentId?)`, `canPlace(documentId?)` (was a `documentId` first). A placing verb refuses with `permission-denied` (`error.permission: 'annotations:create'`) where `canPlace()` is false.

  Create and update verbs resolve what they made: `createLibrary`, `updateLibrary` and `importLibrary` resolve `{ library }`; `createAsset`, `createAssetFromAnnotations`, `updateAsset`, `moveAsset` and `duplicateAsset` resolve `{ asset }`; `placeAsset` resolves `{ annotation }`, and `placeAssetOnPages` the placed annotations. A page argument is a ref or an index, and a page that isn't there refuses the call before anything is placed. Every async verb takes a `signal`: cancelled, it rejects `operation-cancelled` and keeps nothing.

  `canCreateFromAnnotations()` is new: making a stamp from annotations copies them out, so it needs `doc.download`. `onArmChanged` carries `{ documentId, asset }` (was `assetId`), and fires whenever the armed stamp changes, also when the annotation plugin drops it. The event payloads are named after their events (`StampLibraryChangedEvent`, `StampLibraryCreatedEvent`, `StampAssetDeletedEvent`, …). `stampState` declares the state (`armedAsset`).

  The settings are live: `assetEngine`, `previewWidth` and `dynamic` are read through `getSettings()`, changed with `updateSettings()` and `resetSettings()`, and announced by `onSettingsChanged` (`STAMP_DEFAULTS`). A new `assetEngine` is used from the next library operation on.

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – When the annotation plugin drops an armed stamp on its own (a tool switch, a closed document), `getArmedAsset` readers are woken and `onArmChanged` announces the disarm.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `persistStampLibraries` and `restoreStampLibraries` take only the members they use (`exportLibrary` and `onLibraryChanged`, and `importLibrary`), so a framework's own service of the plugin works as well as the capability.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Follows the annotation contract (`canPlace` asks the document's `canCreate`).

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Internal: the controller composes through the kernel's `composeApi`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The plugin's definition takes its types from its token, state and settings instead of type arguments. It declares no settings of its own, so its definition's settings type is `NoSettings`.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Declare the optional annotation and actions dependencies the plugin resolves per document.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A typed mark (`mark: { kind: 'text' }`) is centered in its box, so it sits in the middle of its preview and of a signature field instead of in the top-left corner.

## 3.0.0-next.14

## 3.0.0-next.13

### Minor Changes

- [#812](https://github.com/embedpdf/embed-pdf-viewer/pull/812) by [@bobsingor](https://github.com/bobsingor) – Add persistent library kinds and filtering so stamps, signatures, and custom collections can share the library system. Support renaming and recategorizing libraries, authoring marks from drawn strokes, typed text, images, or PDF pages, and querying the currently armed asset for signature-field placement.

## 3.0.0-next.12

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Publish a bundle-safe `/contract` entry for stamp-library tokens, assets, previews, configuration, and capability types without import, render, or plugin wiring.

### Patch Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Dynamic stamp evaluation constructs its OWN standalone realm per detached stamp-asset document (`StampScriptingOptions` — the opt-in and script observers stay stamp-config; the viewer document's shared host is never involved).

## 3.0.0-next.10

## 3.0.0-next.9

### Patch Changes

- [#772](https://github.com/embedpdf/embed-pdf-viewer/pull/772) by [@bobsingor](https://github.com/bobsingor) – Update canonical stamp-library import and append flows for the required
  `pages.insert` and `pages.extract` engine operations, removing obsolete
  optional-feature checks.

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

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces reusable PDF stamp libraries. It imports PDF pages as vector stamp assets, generates previews, supports opt-in dynamic stamps, and places selected stamps through the annotation plugin's tool flow.
