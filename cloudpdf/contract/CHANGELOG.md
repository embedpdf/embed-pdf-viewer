# @cloudpdf/contract

## 3.0.0-next.15

### Minor Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Document `annotKey` as `obj:N` (an annotation's object number) or `base:N` (an annotation the uploaded file stores inline, by the position it was born at). Annotation reads and write results carry `PageRef`s and `AnnotationRef`s, manifest pages are `{ page, cache }`, and the page revision, weak annotation and `shouldRefetch` fields are gone.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Add `doc.changes` (`POST /v1/docs/{docId}/layers/{layerName}/changes`): user actions as changes, each applied all or none, or the undo of an earlier change, answered in order with each change's result or refusal.

  The OpenAPI document names every shared model once and refers to it: page, annotation and field refs, form fields, drafts and patches, a write's meta, the metadata, and each plane's error envelope (every error response is now `EngineErrorPayload` or `AdminErrorPayload`, not a copy per operation and status). Models are no longer inlined per response, so the generated SDKs carry one type per model instead of one per place it appears.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A form field carries `createdBy`, `createdAt`, `filledBy`, `filledByName`, `filledAt` and `importedBy`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Form fields carry `groupId`, and a field's create and update take it. A token's `identity` no longer has `groups`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `doc.forms.reorderCalculations`. Field drafts and patches take `actions` (named components `FieldScriptWrite`, `FieldActionsPatch`, `FieldPosition`).

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Removed `doc.forms.exportData` and `doc.forms.importData` (FDF/XFDF). Form bundles stay out of the contract for now, as annotation bundles do.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `doc.forms.updateWidget` (`PATCH …/form/widgets/{pageKey}/{annotKey}`). `doc.forms.list` returns every widget's row beside the fields; form results carry the rows of the widgets they changed. Named components `WidgetAnnotation` and `WidgetPatch`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – New operation `doc.forms.deleteWidget`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) –
  - Widgets: `borderStyle` can be `underline`; `dashArray` and `checkStyle`.
  - A form write's `meta.redrawnWidgets`: the widgets whose pictures it changed.
  - A `forms.setDisplay` op takes no `expect`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) –
  - Pages: `tabOrder`, the order a page's annotations take keyboard focus in, or `null`.
  - List boxes: `topIndex`, the option in the box's top row.
  - A widget's `fontFamily` is a font name as a free text's is (a standard font, a registered font's key, or a document font's family), not only a standard font.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The `forms.setSignatureAppearance` change op names its PDF as `resources: { appearance }`, and the notes describe the one multipart envelope: a JSON `body` part naming each file by role, and `resource:<key>` file parts.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Page routes take a `pageKey` path parameter (`obj:N`, the page's indirect object number) in place of the numeric `pon`, mirroring `annotKey` and `fieldKey`; page mutation bodies send `pages: PageRef[]`, `pages/names` sends `{ name, page }`, and every page-bearing record in the API uses `page`/`pages`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Update the CloudPDF API contract for the revised engine page, annotation, form,
  and drawing shapes. Page and annotation references use object numbers, text
  quadrilaterals name their corners, and form flags use the same flat shape as
  other flags.

  A popup update's `parent` is one nullable `AnnotationRef`, no longer a union that names it twice; generators that reject duplicate union members (PHP) accept it.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Field drafts and patches take the `pushbutton` family; widget rows, placements and patches have `caption`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `doc.pages.reorder` replaces `doc.pages.move`; new `doc.annotations.reorder` and `doc.forms.reorderWidgets`. Page inserts document a `position` instead of `toIndex`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Widget placements and widget patches take `actions` (named components `PdfActionWrite`, `WidgetActionsPatch`).

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A box kind's create takes `box` or a `rect` (typed as a box) with a quarter turn; widgets have `box` and `rotation`, and placements take `rotation` and their `rect` or their `box`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Document `Idempotency-Key` on every layer write operation (`idempotencyKeyHeader`): a retry under the same key on the same layer answers with what the first request committed. The error codes include `ObjectNumberUnavailable` and `LayerFull`.

### Patch Changes

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The widget attach and detach routes accept the widget's `AnnotationRef` as `body.widget`; widget records on the wire carry `ref`.

## 3.0.0-next.14

### Minor Changes

- [#827](https://github.com/embedpdf/embed-pdf-viewer/pull/827) by [@bobsingor](https://github.com/bobsingor) – Describe measurement annotation fields and add typed APIs to read page viewports and update page calibration.

## 3.0.0-next.13

### Minor Changes

- [#817](https://github.com/embedpdf/embed-pdf-viewer/pull/817) by [@bobsingor](https://github.com/bobsingor) – Expose structured FreeText rich text in OpenAPI annotation responses, including paragraph and run styles and custom font family names.

  Update signature and version analysis response schemas with applicable restrictions, current-state findings, and information about later revisions and reverted objects.

- [#812](https://github.com/embedpdf/embed-pdf-viewer/pull/812) by [@bobsingor](https://github.com/bobsingor) – Add API contracts and OpenAPI schemas for preparing, completing, aborting, listing, and analyzing digital signatures. Add document version history, immutable version downloads, signed revision downloads, and signature contents and digest endpoints, with signing permissions and version conflict responses.

## 3.0.0-next.12

### Minor Changes

- [#803](https://github.com/embedpdf/embed-pdf-viewer/pull/803) by [@bobsingor](https://github.com/bobsingor) – Add `doc.annotations.flatten` and `doc.annotations.exportAppearance` to the public contract.

  Add `doc.pages.setName` and `doc.pages.removeName` for registering, renaming, and removing named pages (`/Names /Pages` entries) on a layer.

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – The annotation and form response schemas now describe action nodes as a payload-carrying discriminated union exposed through reusable OpenAPI components. Recursive `/Next` elements intentionally remain open (`{}`) for Fern compatibility, so generated SDK types show `unknown[]` for nested chains without duplicating the action model for every response path.

## 3.0.0-next.10

### Minor Changes

- [#791](https://github.com/embedpdf/embed-pdf-viewer/pull/791) by [@bobsingor](https://github.com/bobsingor) – Add `doc.annotations.listAll` to the public contract for retrieving every
  page's annotations as one coherent snapshot with audit-head metadata.

## 3.0.0-next.9

### Minor Changes

- [#772](https://github.com/embedpdf/embed-pdf-viewer/pull/772) by [@bobsingor](https://github.com/bobsingor) – Add API definitions for inserting pages from a PDF, inserting blank pages,
  and extracting selected pages as a standalone PDF.

## 3.0.0-next.8

## 3.0.0-next.7

## 3.0.0-next.6

### Minor Changes

- [#766](https://github.com/embedpdf/embed-pdf-viewer/pull/766) by [@bobsingor](https://github.com/bobsingor) – Extend `documents.importFrom` with `mode: "async"`. Async requests accept operator-registered connection sources and return 202 with `tag: "accepted"` and a pending document that callers can poll with `GET /documents/:id`; presigned URL sources remain synchronous.

- [#766](https://github.com/embedpdf/embed-pdf-viewer/pull/766) by [@bobsingor](https://github.com/bobsingor) – Add the provider-neutral `connection` source to `documents.importFrom`. Requests identify an operator-registered connection and object key, plus an optional opaque provider-specific revision, without exposing storage-provider configuration or credentials in the public wire contract.

- [#766](https://github.com/embedpdf/embed-pdf-viewer/pull/766) by [@bobsingor](https://github.com/bobsingor) – Add the `documents.importFrom` operation for importing a PDF from a caller-supplied URL. The request supports optional size and SHA-256 integrity pins, metadata, deduplication, and idempotency fields, while responses distinguish completed imports from validation, authorization, conflict, and upstream transport failures.

- [#766](https://github.com/embedpdf/embed-pdf-viewer/pull/766) by [@bobsingor](https://github.com/bobsingor) – Rename the contract operation from `documents.import` to `documents.importFrom` so generated Java, Python, and Ruby SDKs expose a consistent method name. The HTTP path remains `POST /v1/tenants/{tenantId}/documents/import`. The OpenAPI emitter now rejects group or method segments that collide with reserved words in those target languages.

## 3.0.0-next.5

## 3.0.0-next.4

## 3.0.0-next.3

## 3.0.0-next.2

### Minor Changes

- [#730](https://github.com/embedpdf/embed-pdf-viewer/pull/730) by [@bobsingor](https://github.com/bobsingor) – Adds the share-grant contract: standing, revocable authorization decisions that let a document be embedded with no backend.
  - Defines `shares.create`, `shares.list`, `shares.get`, `shares.update`, and `shares.delete` under `/v1/tenants/:tenantId/shares`, governed by the new `shares.manage` tenant scope.
  - Defines `shares.exchange` at `POST /v1/share-sessions`, the contract's only unauthenticated operation: the grant row is the authorization, so a public share token trades for a short-lived document session JWT. The registry test now pins that surface, making any future credential-less operation an explicit decision.
  - Adds an optional `origins` allowlist to document-token issuance, so a minted token can be restricted to named web origins.
  - Adds `tenants.usage` for per-tenant usage facts, plus `tenants.suspend` and `tenants.resume` for operator-controlled tenant suspension.
  - Reports tenant `status` on tenant records and regenerates `openapi.json`, which now carries 44 operations.

- [#734](https://github.com/embedpdf/embed-pdf-viewer/pull/734) by [@bobsingor](https://github.com/bobsingor) – Adds the integrity-pinned `init → transfer → commit` document upload protocol,
  including presigned PUT and policy-controlled multipart proxy transfer modes.

## 3.0.0-next.1

### Major Changes

- [#720](https://github.com/embedpdf/embed-pdf-viewer/pull/720) by [@bobsingor](https://github.com/bobsingor) – Introduces the complete CloudPDF backend HTTP contract, replacing the narrower `@cloudpdf/admin-api` package.
  - Defines a typed operation registry and Zod request/response schemas for tenant administration, document lifecycle, token delegation, deployment status, and backend-callable document-plane operations.
  - Exposes tenant-aware route builders and operation metadata shared by the admin SDK and server.
  - Adds an OpenAPI 3.1 emitter, a packaged `openapi` entry point, and the generated `openapi.json` artifact.
  - Validates operation IDs, route coverage, schema references, security declarations, and generated OpenAPI output with contract tests.

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the shared CloudPDF administration contract package. It provides the HTTP route definitions and Zod schemas used by both `@cloudpdf/admin` and `@cloudpdf/server` so client and server stay wire-compatible.
