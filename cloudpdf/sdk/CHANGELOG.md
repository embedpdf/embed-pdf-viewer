# @cloudpdf/sdk

## 3.0.0-next.15

### Minor Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A form field carries `createdBy`, `createdAt`, `filledBy`, `filledByName`, `filledAt` and `importedBy`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Form fields carry `groupId`, and a field's create and update take it. A token's `identity` no longer takes `groups`: a `group=` scope names its group.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `client.doc.forms.reorderCalculations()`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Removed `doc.forms.exportData` and `doc.forms.importData`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `client.doc.forms.updateWidget()` (`PATCH …/form/widgets/{pageKey}/{annotKey}`). The form read returns every widget's row beside the fields, and form results carry the rows of the widgets they changed (`WidgetAnnotation`).

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Regenerated: `doc.forms.deleteWidget`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) –
  - Widgets: `borderStyle` can be `underline`; `dashArray` and `checkStyle`.
  - A form write's `meta.redrawnWidgets`: the widgets whose pictures it changed.
  - A `forms.setDisplay` op takes no `expect`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) –
  - Pages: `tabOrder`. List boxes: `topIndex`.
  - A widget's `fontFamily` is any font name, as a free text's is.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The `forms.setSignatureAppearance` change op names its PDF as `resources: { appearance }`.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Regenerated for the `pageKey` path parameter and the `page`/`pages` record fields of the page-identity contract.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Regenerate the TypeScript client for the updated CloudPDF API. Requests and
  responses now expose object-number page references, revised annotation and
  form shapes, and custom metadata endpoints.

  A popup update's `parent` is typed `AnnotationRef | null`; the `AnnotationPatchPopup.Parent` alias, which named `AnnotationRef` twice, is gone.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Push-button field drafts and patches; `caption` on widgets.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Regenerated: `doc.pages.reorder`, `doc.annotations.reorder` and `doc.forms.reorderWidgets` with `PagePosition` and `AnnotationPosition`; `doc.pages.move` is gone.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Widget placements and widget patches take `actions` (`WidgetActionsPatch`, `PdfActionWrite`).

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Widget placements take `rotation`, and `box` beside `rect`; a box kind's create may give `rect` instead of `box`.

### Patch Changes

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Regenerated: widget records carry `ref`, the widget's annotation address.

## 3.0.0-next.14

### Minor Changes

- [#827](https://github.com/embedpdf/embed-pdf-viewer/pull/827) by [@bobsingor](https://github.com/bobsingor) – Add generated page viewport and scale APIs and measurement annotation types.

## 3.0.0-next.13

### Minor Changes

- [#817](https://github.com/embedpdf/embed-pdf-viewer/pull/817) by [@bobsingor](https://github.com/bobsingor) – Add generated annotation response types for FreeText rich-text bodies, paragraphs, and styled runs, and allow custom font family names.

  Expose restrictions, current-state findings, and later-revision details in the generated signature and version analysis response types.

- [#812](https://github.com/embedpdf/embed-pdf-viewer/pull/812) by [@bobsingor](https://github.com/bobsingor) – Add generated `doc.signatures` and `doc.versions` clients, request and response types, and package subpath exports. Support preparing, completing, and aborting signatures; reading signature facts and modification analysis; and downloading document versions, signed revisions, signature contents, and digests.

## 3.0.0-next.12

### Minor Changes

- [#803](https://github.com/embedpdf/embed-pdf-viewer/pull/803) by [@bobsingor](https://github.com/bobsingor) – Add typed SDK methods for selective annotation flattening and appearance export through `client.doc.annotations.flatten` and `client.doc.annotations.exportAppearance`. Add `client.doc.pages.setName` and `client.doc.pages.removeName` for registering, renaming, and removing named pages.

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Action trees now use shared generated types for their payload-carrying union (destinations, URIs, named actions, Hide targets, ResetForm state, file specs) instead of repeating the same models for every annotation and form response path. Recursive `/Next` chain elements remain `unknown[]` — a Fern limitation of the emitted recursive schema, not missing data.

## 3.0.0-next.10

### Minor Changes

- [#791](https://github.com/embedpdf/embed-pdf-viewer/pull/791) by [@bobsingor](https://github.com/bobsingor) – Add `client.doc.annotations.listAll()` for retrieving every page's annotations
  as one coherent layer snapshot.

## 3.0.0-next.9

### Minor Changes

- [#772](https://github.com/embedpdf/embed-pdf-viewer/pull/772) by [@bobsingor](https://github.com/bobsingor) – Add generated SDK methods and request and response types for page insertion,
  blank-page creation, and page extraction.

## 3.0.0-next.8

## 3.0.0-next.7

## 3.0.0-next.6

### Minor Changes

- [#766](https://github.com/embedpdf/embed-pdf-viewer/pull/766) by [@bobsingor](https://github.com/bobsingor) – Add the generated `documents.importFrom` client method and request and response types. The SDK accepts URL or operator-registered connection sources, supports synchronous and asynchronous import modes, exposes integrity, deduplication, metadata, and idempotency options, and maps upstream transport failures to `BadGatewayError`.

## 3.0.0-next.5

## 3.0.0-next.4

## 3.0.0-next.3

## 3.0.0-next.2

### Minor Changes

- [#734](https://github.com/embedpdf/embed-pdf-viewer/pull/734) by [@bobsingor](https://github.com/bobsingor) – Adds the generated TypeScript SDK and its high-level `uploads.create` workflow.
  It hashes browser and Node.js upload sources, negotiates presigned or proxy
  transfer, uploads the bytes, and commits only after integrity verification.
