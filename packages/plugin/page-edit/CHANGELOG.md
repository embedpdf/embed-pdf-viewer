# @embedpdf/plugin-page-edit

## 3.0.0-next.15

### Minor Changes

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – The page-edit plugin now follows the 3.0 public contract.
  - Every verb returns a `Promise` (no `AbortablePromise`) and takes `OperationOptions`; refusals are `PluginError`s.
  - `rotateBy(pages, delta)` takes a page list and a `90 | -90 | 180` delta; `move(pages, placement)` takes a `PagePlacement` (`{ after } | { before } | { index } | 'end'`) instead of an index.
  - `insertBlank` replaces `addBlank`, `insertFromBytes` replaces `insert` (with an optional page subset); `insertFromDocument`, `duplicate` and `extract` are new.
  - The package gains `./contract/host` and `./internal` entries.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – `rotateBy(page)`, `setRotation`, `move` and `delete(pages)` take `PageRef` addresses; `PagePlacement` anchors on `{ before: PageRef }` / `{ after: PageRef }` and is exported from the contract entry.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A page argument is a `PageRef` or an index, in a verb's page list and in a placement (`{ after }`, `{ before }`): an index names the page at that position when the verb is called. The inserts (`insertBlank`, `insertFromBytes`, `insertFromDocument`, `duplicate`) resolve `{ pages }`, the new pages in order; `rotateBy`, `setRotation`, `move` and `delete` resolve nothing.

  `canExtract()` answers whether pages may be copied out (`doc.download`): `extract()` and `duplicate()` need it, and `insertFromDocument()` needs it on the other document. Every verb refuses before it starts, with `error.permission` naming what is missing, `not-found` for a page the document doesn't have, and `invalid-input` for no pages or for deleting every page. Every verb takes a `signal`: an edit whose signal fired while it waited never starts, and one that fires while the engine works rejects `operation-cancelled` at once. `extract()` runs in order with the edits called before it.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Use durable page references and `PdfRotation` for page editing. Relative page
  rotation now groups pages by their resulting absolute rotation and reports
  the updated whole-document layout.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `pageEdit.reorder(pages, placement)` replaces `move()`. A placement is `{ after: page }`, `{ before: page }`, `'start'` or `'end'`; `{ index }` is gone. A placement's page is fixed when the verb is called and handed to the engine as a neighbour.

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The token lists the methods that return a promise, so without a document they reject with `not-ready` in every framework instead of throwing.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The plugin's definition takes its types from its token, state and settings instead of type arguments. It declares no settings of its own, so its definition's settings type is `NoSettings`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A download waits for page edits still on their way, so pages just inserted, moved, rotated or deleted are always in the file.

## 3.0.0-next.14

## 3.0.0-next.13

## 3.0.0-next.12

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Publish a bundle-safe `/contract` entry for the page-edit token and capability type without mutation or plugin wiring.

## 3.0.0-next.10

## 3.0.0-next.9

### Minor Changes

- [#772](https://github.com/embedpdf/embed-pdf-viewer/pull/772) by [@bobsingor](https://github.com/bobsingor) – Add `addBlank()` and `insert()` to the page-edit capability. New pages can be
  placed by page-object-number anchors or absolute index, and blank pages
  default to the size of the neighboring page.

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

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the document page-edit capability. It provides stable page-addressed rotation, movement, and deletion operations together with the pending, gating, and state logic needed by framework integrations.
