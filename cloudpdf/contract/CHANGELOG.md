# @cloudpdf/contract

## 3.0.0-next.20

### Minor Changes

- [#941](https://github.com/embedpdf/embed-pdf-viewer/pull/941) by [@bobsingor](https://github.com/bobsingor) – The contract gains `doc.fonts.list`, `doc.fonts.resolve`, `doc.fonts.programs.get` and `doc.fonts.programs.download`. A program's file needs a token that may write text: any one of the listed capabilities. The fonts models are named once in the OpenAPI document.

- [#940](https://github.com/embedpdf/embed-pdf-viewer/pull/940) by [@bobsingor](https://github.com/bobsingor) – Add the `pages.copy` change op and `objectNumbers` on `pages.insert`, and the page label sections (`labels`) in every page list answer.

- [#924](https://github.com/embedpdf/embed-pdf-viewer/pull/924) by [@bobsingor](https://github.com/bobsingor) – The OpenAPI document names CloudPDF SaaS (`https://engine.cloudpdf.com`) as its server, so the SDKs generated from it reach SaaS when they're given no address, as the browser engine does.

- [#925](https://github.com/embedpdf/embed-pdf-viewer/pull/925) by [@bobsingor](https://github.com/bobsingor) – `tokens.issue` makes upload tokens: `{ kind: 'upload', sub, folderId?, metadata?, maxFiles?, maxBytes?, origins?, expiresIn }`. A key needs `docs.create` to make one. `documents.init`, `documents.commit` and `documents.uploadProxy` accept them as a new `upload-jwt` credential (OpenAPI scheme `uploadToken`).

### Patch Changes

- [#944](https://github.com/embedpdf/embed-pdf-viewer/pull/944) by [@bobsingor](https://github.com/bobsingor) – `tokens.issue` and `grants.create` describe the cap: a tenant token gives only document permissions it holds itself. `grants.update` lists its `403` response.

## 3.0.0-next.19

### Minor Changes

- [#918](https://github.com/embedpdf/embed-pdf-viewer/pull/918) by [@bobsingor](https://github.com/bobsingor) – Share links are grants. The operations are `grants.*` under
  `/v1/tenants/{tenantId}/grants`, the scope is `grants.manage`, and the public
  exchange is `POST /v1/grant-sessions` with `{ grant, passphrase }`. Answers say
  `grant`/`grants`, the record says `passphraseProtected`, and create and update
  take `passphrase`. A grant has a `name` (1 to 100 characters, trimmed, or null).
  New grants are `grt_…`; `shr_…` ids keep working. The errors are
  `GrantPassphraseRequired` and `GrantExpired`, a layer names its `grantId`, and
  every `Share*` schema and type is `Grant*`.

## 3.0.0-next.18

### Minor Changes

- [#917](https://github.com/embedpdf/embed-pdf-viewer/pull/917) by [@bobsingor](https://github.com/bobsingor) – Add folders: `folders.create`, `folders.list`, `folders.get` (with the path
  above the folder), `folders.update` to rename, `folders.moveInto` to move
  documents and folders together, and `folders.delete` for empty folders. The
  top level is the place `root`. Document records carry `folderId`;
  `documents.init` and `documents.importFrom` take one, and `documents.list`
  filters by it. Folder conflicts answer 409 with `details.reason`.

- [#917](https://github.com/embedpdf/embed-pdf-viewer/pull/917) by [@bobsingor](https://github.com/bobsingor) – Documents have a `name`: set it with `documents.init` or `documents.import`
  (it defaults to the document id) and change it with the new `documents.update`
  operation, which needs the new `docs.update` tenant scope. `documents.list`
  gains `q` to search names ignoring case, `sort` (`createdAt`, `name` or
  `size`) and `order`, and no longer lists documents that are being deleted
  unless `state=deleting` asks for them.

- [#917](https://github.com/embedpdf/embed-pdf-viewer/pull/917) by [@bobsingor](https://github.com/bobsingor) – `folders.delete` takes `recursive=true` to delete a folder with everything in
  it. Without it, a folder that holds anything is still refused.

- [#917](https://github.com/embedpdf/embed-pdf-viewer/pull/917) by [@bobsingor](https://github.com/bobsingor) – Document operations accept tenant JWTs, which need the operation's document
  capabilities exactly as a document JWT does; no tenant scope reaches inside a
  document. A tenant token's `scope` now takes document capabilities next to
  tenant scopes, and they hold for every document of the tenant.
  `documents.download` needs `doc.download` and `documents.thumbnail` needs
  `doc.render` instead of `docs.read`. `docs.update` renames and moves, and never
  changes content.

### Patch Changes

- [#910](https://github.com/embedpdf/embed-pdf-viewer/pull/910) by [@bobsingor](https://github.com/bobsingor) – The `doc.versions.*` operations take the layer: their paths are `/v1/docs/:docId/layers/:layerName/versions…`. `doc.versions.list` answers `LayerVersions` (`{ baseSha, versions }`): the layer's base and its versions, the upload first.

- [#909](https://github.com/embedpdf/embed-pdf-viewer/pull/909) by [@bobsingor](https://github.com/bobsingor) – Share links carry `identity` (who their visitors are, for a link made for one person) on the link record, `shares.create` and `shares.update`. `Identity` is a named component, shared with `tokens.issue`, so the SDKs have one type for it.

- [#910](https://github.com/embedpdf/embed-pdf-viewer/pull/910) by [@bobsingor](https://github.com/bobsingor) – The signature notes describe the new rule. A signature is made over the layer's own base, and its new version is that layer's own: the document and every other layer stay as they were. `StaleBase` is no longer an error code.

## 3.0.0-next.17

### Minor Changes

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – Share links can be archived: `shares.archive` (`POST /v1/tenants/{tenantId}/shares/{shareId}/archive`) ends a link for good while keeping what its visitors made, and the record carries `archivedAt`. `shares.list` leaves archived links out unless asked with `archived=true`. `shares.delete` deletes only a link whose visitors made no changes and answers 409 otherwise, and `shares.update` answers 409 for an archived link.

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – Add `doc.downloadLink` (`POST /v1/docs/{docId}/layers/{layerName}/download-link`, `doc.download`): a short-lived URL (`expiresIn` 60 to 3600 seconds, default 300) that downloads the layer's current PDF with a plain GET and no Authorization header, for services that only take a URL. It downloads that one file as it is when made, and answers 404 once the layer changes.

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – Add `documents.layers.delete` (`DELETE /v1/tenants/{tenantId}/documents/{id}/layers/{layerName}`, scope `docs.delete`): delete a layer and everything it stored, for example a user's data. A layer that was written can't be used again under its name; one nobody wrote stays usable. A layer a share link uses is refused with 409 until the link is deleted.

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – Add `documents.layers.list` (`GET /v1/tenants/{tenantId}/documents/{id}/layers`, scope `docs.read`): a document's layers that hold changes, newest first, paged like the other tenant lists with `limit`, `cursor` and `nextCursor`. Each record says whose layer it is (`shareId` and `visitorId` for a share-link visitor's own), its `storageSizeBytes`, and when it was made, last changed and last seen. `shareId` filters to one link's visitors, a deleted link's too. A layer appears at its first change, and a deleted one is not listed.

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – A share link's `visitorIdleSeconds` is nullable and null by default: visitors' layers stay until they are deleted on purpose. Set it (an hour to 30 days) only for links whose visitors' layers are throwaway, and set it back to null on `shares.update` to stop deleting them.

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – Share links take `visitorIdentity` (`ShareVisitorIdentitySchema`: the fields to ask, each required or optional, `ask`, `purpose`, `privacyUrl`), and the exchange request takes the visitor's answers (`ShareVisitorAnswersSchema`). The exchange response's `visitor.identityRequest` (`ShareVisitorIdentityRequestSchema`) says what a link that asks before the first change still needs. New operations `shares.visitors.list` and `shares.visitors.delete`, with `ShareVisitorRecordSchema`. Admin error payloads may carry `error.details`. `visitorLayerIdleSeconds` is now `visitorIdleSeconds`.

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – Share links say whose layer their visitors write into. `layerMode` is `'shared'` (one layer, `layerName`, as before) or `'per-visitor'` (each visitor gets a layer of their own, and `layerName` is `null`), with `keepVisitorLayers` and `visitorIdleSeconds` (an hour to 30 days) for per-visitor links. `shares.create` and `shares.update` take all of them, so a link can switch modes and keep its token. The exchange takes `visitorHandle` and `restart`, and answers `layerMode` and `visitor: { handle, keep }`: send the handle back to stay the same visitor, and keep it for the next visit when `keep` is true.

## 3.0.0-next.16

### Minor Changes

- [#891](https://github.com/embedpdf/embed-pdf-viewer/pull/891) by [@bobsingor](https://github.com/bobsingor) – `doc.changes` takes the attachment ops under `doc.attachments.modify`. New operations: `doc.attachments.list`, `doc.attachments.download` and `doc.annotations.readFile`.

- [#885](https://github.com/embedpdf/embed-pdf-viewer/pull/885) by [@bobsingor](https://github.com/bobsingor) – The contract gains `doc.outline.get`, and `doc.changes` takes the outline ops under the `doc.outline.modify` capability. The outline's models are named once in the OpenAPI document.

- [#890](https://github.com/embedpdf/embed-pdf-viewer/pull/890) by [@bobsingor](https://github.com/bobsingor) – `doc.changes` takes the page ops under `doc.pages.assemble`, with a PDF to insert as a multipart part. The operations `doc.pages.reorder`, `doc.pages.rotate`, `doc.pages.delete`, `doc.pages.insert` and `doc.pages.insertBlank` are removed: page edits are changes.

### Patch Changes

- [#883](https://github.com/embedpdf/embed-pdf-viewer/pull/883) by [@bobsingor](https://github.com/bobsingor) – The `doc.pages.extract` operation describes its flatten options and their permissions.

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
