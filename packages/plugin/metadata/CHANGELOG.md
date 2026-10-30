# @embedpdf/plugin-metadata

## 3.0.0-next.19

## 3.0.0-next.18

## 3.0.0-next.17

### Minor Changes

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – A named type for the state: `MetadataState`, what `metadataState` reads and `useMetadataState()` returns, the State table of the metadata page with a comment on each field. Published types now name it instead of spelling out its fields.

## 3.0.0-next.16

## 3.0.0-next.15

### Minor Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Metadata is a mirror of the document: it loads once the plugin connects, follows `metadata.updated` from every session, and reloads after a desynced stream. `onResynced` announces loads; `refresh()` takes no options.

  Custom metadata keys are exposed through their own document operations and stay in sync with the mirrored metadata snapshot.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `canEdit()` is `canUpdate()`. `update()` resolves `{ metadata }` and `custom.update()` resolves `{ custom }`: the fields after the change. `refresh()` and `custom.refresh()` take a `signal`, and so do both updates: a signal that already fired rejects `operation-cancelled` before the engine is called.

  `metadataState` declares the metadata's state for every framework: `metadata`, `custom` and `status`.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Rewritten on the kernel's `create()` controller hook. `current()` → `getSnapshot()`, `reload()` → `refresh()`, new `getStatus()` and `onUpdated`; `update()` resolves with the engine result only after the snapshot reflects it. The confirmed `metadata.updated` event is the one path that updates the snapshot, so own, foreign, scripted and remote edits behave identically, and a slow initial read can no longer overwrite a newer value.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `onUpdated` and `custom.onUpdated` carry the engine's `origin` as it is (`kind`, `sessionId`, `sub`, `ts`, `serverId`, `tx`), in place of `locality`, `sessionId` and `actorId`. An update refused without `doc.metadata.modify` has `error.permission` set to it.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The metadata is read on demand, never as a document opens: `getStatus()` is `'idle'` until something asks, then `'loading'` and `'ready'` (or `'forbidden'` / `'error'`). `ensureLoaded()` reads the standard fields and the custom keys unless they're loaded or loading, and resolves once both are there; `onResynced` fires on that first load. `metadataState` asks for it, so `useMetadataState()` (and each framework's equivalent) loads the metadata of the document it reads.

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The token lists the methods that return a promise, so without a document they reject with `not-ready` in every framework instead of throwing.

## 3.0.0-next.14

## 3.0.0-next.13

## 3.0.0-next.12

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Publish a bundle-safe `/contract` entry for the metadata token, state, and capability types without event, reducer, or plugin wiring.

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

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces reactive document metadata for EmbedPDF v3. It reads and updates the PDF information dictionary and stays synchronized with both local edits and remote document events.
