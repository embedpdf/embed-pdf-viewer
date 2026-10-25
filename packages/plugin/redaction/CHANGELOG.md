# @embedpdf/plugin-redaction

## 3.0.0-next.16

## 3.0.0-next.15

### Minor Changes

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – The redaction plugin now follows the 3.0 public contract.
  - Pending marks are page-space `RedactionMark`s: `listPending(filter?)`, `getPending(ref)`, `getPendingCount(page?)`; `estimateCollateral(refs?)` returns `{ count, refs }`; `getLastResult` replaces `lastResult`.
  - Marking verbs: `markSelection` (was `queueCurrentSelection`, returns the refs), `markArea`, `markPage`, `markMatches` (needs the search plugin), `unmark`, `clearPending`, `updateLabel` (was `setLabel`).
  - `apply` takes refs; `applyPages` is new; `applyAll` unchanged. `onApplied` is an event hook carrying `{ result, origin }`; `onPendingChanged { pages }` is new.
  - Removed: `enableRedact`, `toggleRedact`, `isRedactActive` (use `interaction.activateTool('redact')`), `preparePending`, `pendingCount`.
  - `redactionPlugin(config)` accepts `overlay` defaults for the marks it creates. The package gains `./contract/host` and `./internal` entries and depends on `@embedpdf/plugin-search` (optional at runtime).

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Pending redaction items carry `page: PageRef`; `applyAll` and apply results address pages by ref.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `onApplied` carries the engine's `origin` as it is (`kind`, `sessionId`, `sub`, `ts`, `serverId`, `tx`), in place of `locality`, `sessionId` and `actorId`. Marking without permission to create annotations rejects with `error.permission` set to `'annotations:create'`, and `canMark` reads that same permission.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The `overlay` settings apply to every mark: the redact tool's, the selected text's and the ones made from code. They become the redact tool's defaults, and they are live: read through `getSettings()`, changed with `updateSettings()` and `resetSettings()` for every document, and announced by `onSettingsChanged` (`REDACTION_DEFAULTS`: a black fill, a white Helvetica label that fits the area).

  Marking verbs resolve the marks they made: `markSelection()` and `markMatches()` resolve `{ marks }`, `markArea()` and `markPage()` `{ mark }`, and `updateLabel()` `{ mark }`. A mark has `repeat`. `canUnmark(ref)` and `canUpdateLabel(ref)` are new and answer per mark; `unmark()` and `clearPending()` report a mark this session may not delete as failed with `permission-denied`, and `updateLabel()` refuses one it may not change. Page arguments are a ref or an index, and every async verb takes a `signal`. `redactionState` declares the state (`pendingCount`, `applying`, `lastResult`).

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Marking the selected text goes through the annotation plugin's `createFromSelection('redact')`, and the marks are read with `list({ pages })`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `markArea` and `markPage` reject (never throw synchronously) when marking is not allowed or the page is unknown.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The token lists the methods that return a promise, so without a document they reject with `not-ready` in every framework instead of throwing.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Follows the interaction contract (`getActiveToolId`) and the annotation contract (`getRaw`/`listRaw`/`updateRaw`). `markSelection` reads the selection through `getSnapshot`.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Internal: the controller composes through the kernel's `composeApi`; page ↔ PDF conversion goes through the kernel's page geometry instead of a copy of its own.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A download waits for a redaction that is being applied, so the removed content is never in the file.

## 3.0.0-next.14

## 3.0.0-next.13

## 3.0.0-next.12

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Publish a bundle-safe `/contract` entry for the redaction token, state, pending-item, and capability protocols without destructive-apply plugin wiring.

## 3.0.0-next.10

### Minor Changes

- [#788](https://github.com/embedpdf/embed-pdf-viewer/pull/788) by [@bobsingor](https://github.com/bobsingor) – Add `canMark()` for redaction annotation creation and make `canApply()` mirror
  every capability required by destructive redaction. Unauthorized selection
  queueing is now rejected before creating marks.

## 3.0.0-next.9

## 3.0.0-next.8

## 3.0.0-next.7

## 3.0.0-next.6

## 3.0.0-next.5

## 3.0.0-next.4

### Patch Changes

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Preserves oriented selection quads through text-redaction marks, previews, and native apply so rotated, sheared, and mirrored text can be redacted without expanding the mark to its axis-aligned bounds.

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the rebuilt redaction workflow. It manages pending redaction marks, estimates affected content, and applies destructive redaction through the document engine while leaving mark creation to the annotation system.
