# @cloudpdf/sdk

## 3.1.0

### Minor Changes

- [#1030](https://github.com/embedpdf/embed-pdf-viewer/pull/1030) by [@bobsingor](https://github.com/bobsingor) – The types carry `viewportsVersion` on the manifest and a write's cache delta, `viewports` on a page's layout, the `pages.setScale` change op and its answer, and the new `layout` in `doc.pages.setScale`'s answer.

## 3.0.0

### Minor Changes

- [#791](https://github.com/embedpdf/embed-pdf-viewer/pull/791) by [@bobsingor](https://github.com/bobsingor) – Add `client.doc.annotations.listAll()` for retrieving every page's annotations
  as one coherent layer snapshot.

- [#891](https://github.com/embedpdf/embed-pdf-viewer/pull/891) by [@bobsingor](https://github.com/bobsingor) – A new `doc.attachments` resource with `list` and `download`, and `doc.annotations.readFile` for a file attachment annotation's file. `doc.changes` ops include `attachments.create` and `attachments.delete`, each undone by its `opId`.

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Action trees now use shared generated types for their payload-carrying union (destinations, URIs, named actions, Hide targets, ResetForm state, file specs) instead of repeating the same models for every annotation and form response path. Recursive `/Next` chain elements remain `unknown[]` — a Fern limitation of the emitted recursive schema, not missing data.

- [#991](https://github.com/embedpdf/embed-pdf-viewer/pull/991) by [@bobsingor](https://github.com/bobsingor) – The manifest and cache delta types have `contentsVersion`.

- [#734](https://github.com/embedpdf/embed-pdf-viewer/pull/734) by [@bobsingor](https://github.com/bobsingor) – Adds the generated TypeScript SDK and its high-level `uploads.create` workflow.
  It hashes browser and Node.js upload sources, negotiates presigned or proxy
  transfer, uploads the bytes, and commits only after integrity verification.

- [#917](https://github.com/embedpdf/embed-pdf-viewer/pull/917) by [@bobsingor](https://github.com/bobsingor) – Add the `folders` client (`create`, `list`, `get`, `update`, `moveInto`,
  `delete`), a `folderId` option on `documents.init`, `documents.importFrom`,
  `documents.list` and `uploads.create`, and `folderId` on document records.

- [#917](https://github.com/embedpdf/embed-pdf-viewer/pull/917) by [@bobsingor](https://github.com/bobsingor) – Add `documents.update` for renaming documents, a `name` option on
  `documents.init`, `documents.importFrom` and `uploads.create`, and the `q`,
  `sort` and `order` options on `documents.list`. Document records now carry
  `name`.

- [#803](https://github.com/embedpdf/embed-pdf-viewer/pull/803) by [@bobsingor](https://github.com/bobsingor) – Add typed SDK methods for selective annotation flattening and appearance export through `client.doc.annotations.flatten` and `client.doc.annotations.exportAppearance`. Add `client.doc.pages.setName` and `client.doc.pages.removeName` for registering, renaming, and removing named pages.

- [#885](https://github.com/embedpdf/embed-pdf-viewer/pull/885) by [@bobsingor](https://github.com/bobsingor) – `doc.outline.get()` reads a document's outline, and changes take the outline ops.

- [#766](https://github.com/embedpdf/embed-pdf-viewer/pull/766) by [@bobsingor](https://github.com/bobsingor) – Add the generated `documents.importFrom` client method and request and response types. The SDK accepts URL or operator-registered connection sources, supports synchronous and asynchronous import modes, exposes integrity, deduplication, metadata, and idempotency options, and maps upstream transport failures to `BadGatewayError`.

- [#989](https://github.com/embedpdf/embed-pdf-viewer/pull/989) by [@bobsingor](https://github.com/bobsingor) – The head type has `engine`, the server's engine value for each kind of cached read; the manifest type no longer has `serverFonts`.

- [#994](https://github.com/embedpdf/embed-pdf-viewer/pull/994) by [@bobsingor](https://github.com/bobsingor) – Every error response is one type, `ErrorResponse`, with its error `EngineError` and a `code` from one list, replacing `EngineErrorPayload`, `AdminErrorPayload` and the per-operation error types such as `DocHead404Response`. A response type is named after its operation alone (`DocFormsListResponse`, not `DocFormsList200Response`). Sizes, counts, durations and timestamps are integers, and `nextCursor`, `thumbnailState` and `thumbnailUrl` are always there. A signature's `fieldMdp` and `lock` are `FieldLockSpec`, whose `permission` is a `DocMdpPermission` that is never null. A DocMDP level and a page or widget rotation are integers.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A form field carries `createdBy`, `createdAt`, `filledBy`, `filledByName`, `filledAt` and `importedBy`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Form fields carry `groupId`, and a field's create and update take it. A token's `identity` no longer takes `groups`: a `group=` scope names its group.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `client.doc.forms.reorderCalculations()`.

- [#917](https://github.com/embedpdf/embed-pdf-viewer/pull/917) by [@bobsingor](https://github.com/bobsingor) – Add the `recursive` option to `folders.delete`.

- [#1019](https://github.com/embedpdf/embed-pdf-viewer/pull/1019) by [@bobsingor](https://github.com/bobsingor) – `Font` has `builtIn`: whether the server comes with the font (the standard fonts and its Hebrew and Arabic fallback fonts), or it is one of yours or the document's.

- [#941](https://github.com/embedpdf/embed-pdf-viewer/pull/941) by [@bobsingor](https://github.com/bobsingor) – `doc.fonts.list()`, `doc.fonts.resolve()`, `doc.fonts.programs.get()` and `doc.fonts.programs.download()`: the fonts text can be written in, what a write would draw each run in, and a font program's facts and file. A manifest carries `fontsVersion` and `serverFonts`, a change's cache delta `fontsVersion`, and a write's meta the `missingCharacters` it drew in no font.

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

- [#918](https://github.com/embedpdf/embed-pdf-viewer/pull/918) by [@bobsingor](https://github.com/bobsingor) – `client.shares` is `client.grants`, with a grant's `name` and `passphrase`.

- [#996](https://github.com/embedpdf/embed-pdf-viewer/pull/996) by [@bobsingor](https://github.com/bobsingor) – Every point in time is an ISO 8601 date-time string, where `createdAt`, `updatedAt`, the other `…At` fields and every `expiresAt` were numbers in milliseconds or seconds. A token revoke takes `expiresAt` instead of `expiresAtSeconds`. A grant's `createdAt` and `updatedAt`, and a visitor's `firstSeenAt` and `lastSeenAt`, are no longer typed nullable.

- [#910](https://github.com/embedpdf/embed-pdf-viewer/pull/910) by [@bobsingor](https://github.com/bobsingor) – `doc.versions.*` takes the layer: `list`, `signatures`, `signatureContents`, `signatureDigest`, `analysis`, `download` and `revision` read `/v1/docs/{docId}/layers/{layerName}/versions…`. `list` answers the layer's `baseSha` and its versions (the upload, then the ones its signatures made), and another layer's version is 404.

- [#978](https://github.com/embedpdf/embed-pdf-viewer/pull/978) by [@bobsingor](https://github.com/bobsingor) – Annotations, drafts and patches of every markup kind have `richText`, the
  comment with formatting (`RichTextDocument`, `RichTextDocumentInput`), or
  `null` for a plain comment.

- [#827](https://github.com/embedpdf/embed-pdf-viewer/pull/827) by [@bobsingor](https://github.com/bobsingor) – Add generated page viewport and scale APIs and measurement annotation types.

- [#967](https://github.com/embedpdf/embed-pdf-viewer/pull/967) by [@bobsingor](https://github.com/bobsingor) – `deployment.modules()` lists the installed server modules: their names, permissions and meters. `tenants.usage` takes `from` and `to` for a window of UTC days, and its `metrics` include modules' meters.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The `forms.setSignatureAppearance` change op names its PDF as `resources: { appearance }`.

- [#997](https://github.com/embedpdf/embed-pdf-viewer/pull/997) by [@bobsingor](https://github.com/bobsingor) – Names follow one rule: `sizeBytes` (documents, layers, versions and the init request), `baseSha256`, a manifest's `baseSizeBytes`, `uploadTtlSeconds` (also on `uploads.create`), `expiresInSeconds`, `docIds`, `md5`, `displaySha256` and `sourceSha256`, `contentsSizeBytes`, `changedRefs`, usage metrics `pdfViews`, `pdfUploads` and `storageBytes` with module meters in a typed `moduleMeters` map, a `submit-form` action's named flags, a seed value's `…Required` booleans and `parserVersion`, and the path arguments `docId`, `annotationKey`, `sha256` and `displaySha256`. `/access`, the event stream's `session` event and object-number reservations say `expiresInSeconds`. Action trees drop `warningFlags`.

- [#971](https://github.com/embedpdf/embed-pdf-viewer/pull/971) by [@bobsingor](https://github.com/bobsingor) – A square, circle, polygon, polyline, line or ink annotation's `color` may be `null`: no stroke.

- [#995](https://github.com/embedpdf/embed-pdf-viewer/pull/995) by [@bobsingor](https://github.com/bobsingor) – A destination's `x`, `y` and `zoom` are always there, `null` to keep the viewer's value, and a document's `openDestination` is always there. A line's `captionEnabled` is a boolean, never `null`. A grant create takes `null` for `origins` and `expiresAt`, as a grant read says them.

- [#993](https://github.com/embedpdf/embed-pdf-viewer/pull/993) by [@bobsingor](https://github.com/bobsingor) – A field's stored value and a measure are one type each, `FormValueEntry` and `PdfMeasurement`, replacing the per-family and per-kind copies such as `FormFieldTextValueEntry` and `AnnotationLineMeasure`. The documentation of each union and enum with a catch-all says what a kind or value the SDK doesn't know reads as.

- [#940](https://github.com/embedpdf/embed-pdf-viewer/pull/940) by [@bobsingor](https://github.com/bobsingor) – Add the `pages.copy` change op and `objectNumbers` on `pages.insert`, and the page label sections (`labels`) in every page list answer.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Regenerated for the `pageKey` path parameter and the `page`/`pages` record fields of the page-identity contract.

- [#890](https://github.com/embedpdf/embed-pdf-viewer/pull/890) by [@bobsingor](https://github.com/bobsingor) – `doc.pages` no longer has `reorder`, `rotate`, `delete`, `insert` and `insertBlank`: page edits go through `doc.changes`, whose ops now include `pages.rotate`, `pages.reorder`, `pages.delete`, `pages.insertBlank` and `pages.insert`, and each can be undone by its `opId`.

- [#772](https://github.com/embedpdf/embed-pdf-viewer/pull/772) by [@bobsingor](https://github.com/bobsingor) – Add generated SDK methods and request and response types for page insertion,
  blank-page creation, and page extraction.

- [#1005](https://github.com/embedpdf/embed-pdf-viewer/pull/1005) by [@bobsingor](https://github.com/bobsingor) – A document head's `permissions.flags` (`PdfPermissionFlags`) replaces `bits`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Regenerate the TypeScript client for the updated CloudPDF API. Requests and
  responses now expose object-number page references, revised annotation and
  form shapes, and custom metadata endpoints.

  A popup update's `parent` is typed `AnnotationRef | null`; the `AnnotationPatchPopup.Parent` alias, which named `AnnotationRef` twice, is gone.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Push-button field drafts and patches; `caption` on widgets.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Regenerated: `doc.pages.reorder`, `doc.annotations.reorder` and `doc.forms.reorderWidgets` with `PagePosition` and `AnnotationPosition`; `doc.pages.move` is gone.

- [#817](https://github.com/embedpdf/embed-pdf-viewer/pull/817) by [@bobsingor](https://github.com/bobsingor) – Add generated annotation response types for FreeText rich-text bodies, paragraphs, and styled runs, and allow custom font family names.

  Expose restrictions, current-state findings, and later-revision details in the generated signature and version analysis response types.

- [#924](https://github.com/embedpdf/embed-pdf-viewer/pull/924) by [@bobsingor](https://github.com/bobsingor) – `new CloudPDFClient({ token })` reaches CloudPDF SaaS: `baseUrl` is only needed for your own CloudPDF server. `CloudPDFEnvironment.Saas` names the SaaS address. Proxy uploads go to the same address, with the client's token.

- [#909](https://github.com/embedpdf/embed-pdf-viewer/pull/909) by [@bobsingor](https://github.com/bobsingor) – `shares.create` and `shares.update` take `identity`, and a share record returns it: who a link's visitors are, for a link made for one person. `Identity` is one shared type, used by `tokens.issue` too.

- [#982](https://github.com/embedpdf/embed-pdf-viewer/pull/982) by [@bobsingor](https://github.com/bobsingor) – `WidgetAnnotation` has `hasMark`: `true` for a signature field's widget with a
  mark in it (signed, or a mark drawn in), whose style can then no longer change.

- [#812](https://github.com/embedpdf/embed-pdf-viewer/pull/812) by [@bobsingor](https://github.com/bobsingor) – Add generated `doc.signatures` and `doc.versions` clients, request and response types, and package subpath exports. Support preparing, completing, and aborting signatures; reading signature facts and modification analysis; and downloading document versions, signed revisions, signature contents, and digests.

- [#951](https://github.com/embedpdf/embed-pdf-viewer/pull/951) by [@bobsingor](https://github.com/bobsingor) – Annotations and widgets have `structurePosition`: where the annotation sits in the document's tags, or `null` when it isn't tagged.

- [#917](https://github.com/embedpdf/embed-pdf-viewer/pull/917) by [@bobsingor](https://github.com/bobsingor) – A tenant token's `scope` in `tokens.issue` takes document capabilities next to
  tenant scopes, and the document operations document tenant tokens as a
  credential.

- [#956](https://github.com/embedpdf/embed-pdf-viewer/pull/956) by [@bobsingor](https://github.com/bobsingor) – `tenants.update({ tenantId, features })` sets the server modules a tenant may use, and tenant records have `features`.

- [#1002](https://github.com/embedpdf/embed-pdf-viewer/pull/1002) by [@bobsingor](https://github.com/bobsingor) – `uploads.create()` and `upload()` resolve `{ status, document }` (was `tag`). Form fields are tagged `kind`, and the init and import answers say `status`.

- [#925](https://github.com/embedpdf/embed-pdf-viewer/pull/925) by [@bobsingor](https://github.com/bobsingor) – `import { upload } from '@cloudpdf/sdk/upload'` uploads a PDF from the browser with an upload token from your server: `upload(file, { token, name?, onProgress?, signal?, baseUrl? })`. The entry is about 3 KB gzipped and has no Node imports. It sends the file with XHR, so `onProgress` follows the bytes. `uploads.create` on a server now reports progress as the bytes go too, instead of only at the start and the end. `Uploads` takes the source reader as a second argument.

- [#992](https://github.com/embedpdf/embed-pdf-viewer/pull/992) by [@bobsingor](https://github.com/bobsingor) – Every request sends `EmbedPDF-Version`, the version the SDK was generated from.

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – Share links that ask their visitors who they are: `visitorIdentity` on `client.shares.create` and `client.shares.update`, the visitor's answers on `client.shares.exchange`, and `visitor.identityRequest` in its response. `client.shares.visitors.list` lists a link's visitors with their answers and layer, and `client.shares.visitors.delete` erases one. `visitorLayerIdleSeconds` is now `visitorIdleSeconds`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Widget placements and widget patches take `actions` (`WidgetActionsPatch`, `PdfActionWrite`).

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Widget placements take `rotation`, and `box` beside `rect`; a box kind's create may give `rect` instead of `box`.

### Patch Changes

- [#944](https://github.com/embedpdf/embed-pdf-viewer/pull/944) by [@bobsingor](https://github.com/bobsingor) – `tokens.issue` and `grants.create` say that a tenant token gives only document permissions it holds itself, and `grants.update` can answer `403`.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Regenerated: widget records carry `ref`, the widget's annotation address.

- [#910](https://github.com/embedpdf/embed-pdf-viewer/pull/910) by [@bobsingor](https://github.com/bobsingor) – `StaleBase` is no longer an engine error code, and the signature notes describe the new rule: a signature's new version belongs to its layer, and the document and every other layer stay as they were.

## 3.0.0-next.23

### Minor Changes

- [#991](https://github.com/embedpdf/embed-pdf-viewer/pull/991) by [@bobsingor](https://github.com/bobsingor) – The manifest and cache delta types have `contentsVersion`.

- [#989](https://github.com/embedpdf/embed-pdf-viewer/pull/989) by [@bobsingor](https://github.com/bobsingor) – The head type has `engine`, the server's engine value for each kind of cached read; the manifest type no longer has `serverFonts`.

- [#994](https://github.com/embedpdf/embed-pdf-viewer/pull/994) by [@bobsingor](https://github.com/bobsingor) – Every error response is one type, `ErrorResponse`, with its error `EngineError` and a `code` from one list, replacing `EngineErrorPayload`, `AdminErrorPayload` and the per-operation error types such as `DocHead404Response`. A response type is named after its operation alone (`DocFormsListResponse`, not `DocFormsList200Response`). Sizes, counts, durations and timestamps are integers, and `nextCursor`, `thumbnailState` and `thumbnailUrl` are always there. A signature's `fieldMdp` and `lock` are `FieldLockSpec`, whose `permission` is a `DocMdpPermission` that is never null. A DocMDP level and a page or widget rotation are integers.

- [#996](https://github.com/embedpdf/embed-pdf-viewer/pull/996) by [@bobsingor](https://github.com/bobsingor) – Every point in time is an ISO 8601 date-time string, where `createdAt`, `updatedAt`, the other `…At` fields and every `expiresAt` were numbers in milliseconds or seconds. A token revoke takes `expiresAt` instead of `expiresAtSeconds`. A grant's `createdAt` and `updatedAt`, and a visitor's `firstSeenAt` and `lastSeenAt`, are no longer typed nullable.

- [#997](https://github.com/embedpdf/embed-pdf-viewer/pull/997) by [@bobsingor](https://github.com/bobsingor) – Names follow one rule: `sizeBytes` (documents, layers, versions and the init request), `baseSha256`, a manifest's `baseSizeBytes`, `uploadTtlSeconds` (also on `uploads.create`), `expiresInSeconds`, `docIds`, `md5`, `displaySha256` and `sourceSha256`, `contentsSizeBytes`, `changedRefs`, usage metrics `pdfViews`, `pdfUploads` and `storageBytes` with module meters in a typed `moduleMeters` map, a `submit-form` action's named flags, a seed value's `…Required` booleans and `parserVersion`, and the path arguments `docId`, `annotationKey`, `sha256` and `displaySha256`. `/access`, the event stream's `session` event and object-number reservations say `expiresInSeconds`. Action trees drop `warningFlags`.

- [#995](https://github.com/embedpdf/embed-pdf-viewer/pull/995) by [@bobsingor](https://github.com/bobsingor) – A destination's `x`, `y` and `zoom` are always there, `null` to keep the viewer's value, and a document's `openDestination` is always there. A line's `captionEnabled` is a boolean, never `null`. A grant create takes `null` for `origins` and `expiresAt`, as a grant read says them.

- [#993](https://github.com/embedpdf/embed-pdf-viewer/pull/993) by [@bobsingor](https://github.com/bobsingor) – A field's stored value and a measure are one type each, `FormValueEntry` and `PdfMeasurement`, replacing the per-family and per-kind copies such as `FormFieldTextValueEntry` and `AnnotationLineMeasure`. The documentation of each union and enum with a catch-all says what a kind or value the SDK doesn't know reads as.

- [#1005](https://github.com/embedpdf/embed-pdf-viewer/pull/1005) by [@bobsingor](https://github.com/bobsingor) – A document head's `permissions.flags` (`PdfPermissionFlags`) replaces `bits`.

- [#982](https://github.com/embedpdf/embed-pdf-viewer/pull/982) by [@bobsingor](https://github.com/bobsingor) – `WidgetAnnotation` has `hasMark`: `true` for a signature field's widget with a
  mark in it (signed, or a mark drawn in), whose style can then no longer change.

- [#1002](https://github.com/embedpdf/embed-pdf-viewer/pull/1002) by [@bobsingor](https://github.com/bobsingor) – `uploads.create()` and `upload()` resolve `{ status, document }` (was `tag`). Form fields are tagged `kind`, and the init and import answers say `status`.

- [#992](https://github.com/embedpdf/embed-pdf-viewer/pull/992) by [@bobsingor](https://github.com/bobsingor) – Every request sends `EmbedPDF-Version`, the version the SDK was generated from.

## 3.0.0-next.22

### Minor Changes

- [#978](https://github.com/embedpdf/embed-pdf-viewer/pull/978) by [@bobsingor](https://github.com/bobsingor) – Annotations, drafts and patches of every markup kind have `richText`, the
  comment with formatting (`RichTextDocument`, `RichTextDocumentInput`), or
  `null` for a plain comment.

- [#967](https://github.com/embedpdf/embed-pdf-viewer/pull/967) by [@bobsingor](https://github.com/bobsingor) – `deployment.modules()` lists the installed server modules: their names, permissions and meters. `tenants.usage` takes `from` and `to` for a window of UTC days, and its `metrics` include modules' meters.

- [#971](https://github.com/embedpdf/embed-pdf-viewer/pull/971) by [@bobsingor](https://github.com/bobsingor) – A square, circle, polygon, polyline, line or ink annotation's `color` may be `null`: no stroke.

## 3.0.0-next.21

### Minor Changes

- [#956](https://github.com/embedpdf/embed-pdf-viewer/pull/956) by [@bobsingor](https://github.com/bobsingor) – `tenants.update({ tenantId, features })` sets the server modules a tenant may use, and tenant records have `features`.

## 3.0.0-next.20

### Minor Changes

- [#941](https://github.com/embedpdf/embed-pdf-viewer/pull/941) by [@bobsingor](https://github.com/bobsingor) – `doc.fonts.list()`, `doc.fonts.resolve()`, `doc.fonts.programs.get()` and `doc.fonts.programs.download()`: the fonts text can be written in, what a write would draw each run in, and a font program's facts and file. A manifest carries `fontsVersion` and `serverFonts`, a change's cache delta `fontsVersion`, and a write's meta the `missingCharacters` it drew in no font.

- [#940](https://github.com/embedpdf/embed-pdf-viewer/pull/940) by [@bobsingor](https://github.com/bobsingor) – Add the `pages.copy` change op and `objectNumbers` on `pages.insert`, and the page label sections (`labels`) in every page list answer.

- [#924](https://github.com/embedpdf/embed-pdf-viewer/pull/924) by [@bobsingor](https://github.com/bobsingor) – `new CloudPDFClient({ token })` reaches CloudPDF SaaS: `baseUrl` is only needed for your own CloudPDF server. `CloudPDFEnvironment.Saas` names the SaaS address. Proxy uploads go to the same address, with the client's token.

- [#951](https://github.com/embedpdf/embed-pdf-viewer/pull/951) by [@bobsingor](https://github.com/bobsingor) – Annotations and widgets have `structurePosition`: where the annotation sits in the document's tags, or `null` when it isn't tagged.

- [#925](https://github.com/embedpdf/embed-pdf-viewer/pull/925) by [@bobsingor](https://github.com/bobsingor) – `import { upload } from '@cloudpdf/sdk/upload'` uploads a PDF from the browser with an upload token from your server: `upload(file, { token, name?, onProgress?, signal?, baseUrl? })`. The entry is about 3 KB gzipped and has no Node imports. It sends the file with XHR, so `onProgress` follows the bytes. `uploads.create` on a server now reports progress as the bytes go too, instead of only at the start and the end. `Uploads` takes the source reader as a second argument.

### Patch Changes

- [#944](https://github.com/embedpdf/embed-pdf-viewer/pull/944) by [@bobsingor](https://github.com/bobsingor) – `tokens.issue` and `grants.create` say that a tenant token gives only document permissions it holds itself, and `grants.update` can answer `403`.

## 3.0.0-next.19

### Minor Changes

- [#918](https://github.com/embedpdf/embed-pdf-viewer/pull/918) by [@bobsingor](https://github.com/bobsingor) – `client.shares` is `client.grants`, with a grant's `name` and `passphrase`.

## 3.0.0-next.18

### Minor Changes

- [#917](https://github.com/embedpdf/embed-pdf-viewer/pull/917) by [@bobsingor](https://github.com/bobsingor) – Add the `folders` client (`create`, `list`, `get`, `update`, `moveInto`,
  `delete`), a `folderId` option on `documents.init`, `documents.importFrom`,
  `documents.list` and `uploads.create`, and `folderId` on document records.

- [#917](https://github.com/embedpdf/embed-pdf-viewer/pull/917) by [@bobsingor](https://github.com/bobsingor) – Add `documents.update` for renaming documents, a `name` option on
  `documents.init`, `documents.importFrom` and `uploads.create`, and the `q`,
  `sort` and `order` options on `documents.list`. Document records now carry
  `name`.

- [#917](https://github.com/embedpdf/embed-pdf-viewer/pull/917) by [@bobsingor](https://github.com/bobsingor) – Add the `recursive` option to `folders.delete`.

- [#910](https://github.com/embedpdf/embed-pdf-viewer/pull/910) by [@bobsingor](https://github.com/bobsingor) – `doc.versions.*` takes the layer: `list`, `signatures`, `signatureContents`, `signatureDigest`, `analysis`, `download` and `revision` read `/v1/docs/{docId}/layers/{layerName}/versions…`. `list` answers the layer's `baseSha` and its versions (the upload, then the ones its signatures made), and another layer's version is 404.

- [#909](https://github.com/embedpdf/embed-pdf-viewer/pull/909) by [@bobsingor](https://github.com/bobsingor) – `shares.create` and `shares.update` take `identity`, and a share record returns it: who a link's visitors are, for a link made for one person. `Identity` is one shared type, used by `tokens.issue` too.

- [#917](https://github.com/embedpdf/embed-pdf-viewer/pull/917) by [@bobsingor](https://github.com/bobsingor) – A tenant token's `scope` in `tokens.issue` takes document capabilities next to
  tenant scopes, and the document operations document tenant tokens as a
  credential.

### Patch Changes

- [#910](https://github.com/embedpdf/embed-pdf-viewer/pull/910) by [@bobsingor](https://github.com/bobsingor) – `StaleBase` is no longer an engine error code, and the signature notes describe the new rule: a signature's new version belongs to its layer, and the document and every other layer stay as they were.

## 3.0.0-next.17

### Minor Changes

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – Share links that ask their visitors who they are: `visitorIdentity` on `client.shares.create` and `client.shares.update`, the visitor's answers on `client.shares.exchange`, and `visitor.identityRequest` in its response. `client.shares.visitors.list` lists a link's visitors with their answers and layer, and `client.shares.visitors.delete` erases one. `visitorLayerIdleSeconds` is now `visitorIdleSeconds`.

## 3.0.0-next.16

### Minor Changes

- [#891](https://github.com/embedpdf/embed-pdf-viewer/pull/891) by [@bobsingor](https://github.com/bobsingor) – A new `doc.attachments` resource with `list` and `download`, and `doc.annotations.readFile` for a file attachment annotation's file. `doc.changes` ops include `attachments.create` and `attachments.delete`, each undone by its `opId`.

- [#885](https://github.com/embedpdf/embed-pdf-viewer/pull/885) by [@bobsingor](https://github.com/bobsingor) – `doc.outline.get()` reads a document's outline, and changes take the outline ops.

- [#890](https://github.com/embedpdf/embed-pdf-viewer/pull/890) by [@bobsingor](https://github.com/bobsingor) – `doc.pages` no longer has `reorder`, `rotate`, `delete`, `insert` and `insertBlank`: page edits go through `doc.changes`, whose ops now include `pages.rotate`, `pages.reorder`, `pages.delete`, `pages.insertBlank` and `pages.insert`, and each can be undone by its `opId`.

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
