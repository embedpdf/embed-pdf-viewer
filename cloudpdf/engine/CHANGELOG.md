# @cloudpdf/engine

## 3.0.0-next.16

### Minor Changes

- [#891](https://github.com/embedpdf/embed-pdf-viewer/pull/891) by [@bobsingor](https://github.com/bobsingor) – On the cloud engine, `doc.attachments.create()` and `delete()` are changes that can be undone, sent through `POST …/changes`, and `download()` returns the bytes. Another session follows `attachments.restored`.

- [#885](https://github.com/embedpdf/embed-pdf-viewer/pull/885) by [@bobsingor](https://github.com/bobsingor) – `doc.outline` on the cloud engine: the outline is read from the shared URL while the layer inherits it, from the layer's otherwise, and its edits are undoable changes.

- [#890](https://github.com/embedpdf/embed-pdf-viewer/pull/890) by [@bobsingor](https://github.com/bobsingor) – On the cloud engine, `doc.pages.rotate()`, `reorder()`, `delete()`, `insert()` and `insertBlank()` are changes that can be undone, sent through `POST …/changes`.

- [#883](https://github.com/embedpdf/embed-pdf-viewer/pull/883) by [@bobsingor](https://github.com/bobsingor) – `pages.extract(pages, options)` sends its options to the server, so a cloud document makes flattened copies too: `{ flatten: { usage: 'print' } }` returns the pages as they print.

- [#883](https://github.com/embedpdf/embed-pdf-viewer/pull/883) by [@bobsingor](https://github.com/bobsingor) – `page.render.image()` makes print pictures (`usage: 'print'`, `viewport: { kind: 'dpi', dpi: 150 | 300 }`), fetched from the print family's path at its tier (`render/print/…` or `render/print-high/…`). A session whose rights the client knows is refused before the request without `doc.print`, or `doc.print.high` at 300 DPI.

### Patch Changes

- [#891](https://github.com/embedpdf/embed-pdf-viewer/pull/891) by [@bobsingor](https://github.com/bobsingor) – Another session's outline edits, and its undos of annotation deletes, move this session's cached pins, so it never reads the old outline or annotations from a cached URL. Every remote event kind is named where they are absorbed, so a new one can't be forgotten.

## 3.0.0-next.15

### Minor Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Address annotations by their life-long ref on every call: updates, deletes and resource reads go to `obj:N` or `base:N`. Remove weak edit sessions (`doc.annotations.beginEdit`) and `capabilities`; a bare HTTP 409 maps to `LayerVersionConflict`.

  Every write takes its options last, with an `opId`; the events of this session's writes carry it as `origin.tx`, and every event from another session carries one too. A create's bytes go in the options (`{ resources }`).

  A document's writes go out one at a time, in the order they were called, each with its `opId` as `Idempotency-Key`; a write lost on the network is sent again under the same key, and the server applies it once. `X-Engine-Session-Id` goes only where the server reads it: writes, `/access`, the event stream and the bulk reservation, so other reads stay plain requests a CDN can answer without a preflight. Only reads (`GET`, `HEAD`) go to the CDN: a write whose path matches a read the CDN serves now reaches the server.

  `doc.objectNumbers` holds this editing session's object numbers. An open that may create calls `/access` for the first 8; a write tops the pool up when it runs low; the event stream's `session` events keep it in step with the server, and `reserve(n)` calls `POST …/object-numbers`. Creates send the numbers they name (`objectNumber`, `objectNumbers`, `widgetObjectNumbers`, `splitObjectNumber`). `onLost` reports numbers the session can no longer use: `'reclaimed'` when the server took them back after the session expired, `'versioned'` after a signature published a new version.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `renderAppearances()` returns every look an annotation has, each image labelled with its `mode` and `state`, and takes `modes` as a filter. Page renders show form fields with the annotations unless `includeFormFields` is `false`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Add `doc.apply(change, options)` to the cloud engine: each change takes its place in the document's line of writes, and changes called while an earlier write is in flight go out together as one `POST …/changes` (one request in flight per document, at most 64 changes each; a change carrying bytes goes in a request of its own). Each call resolves with its own answer, and a change and its undo can share a request. A change is checked against what a request may hold before it joins one, so a malformed change is refused alone. A request lost on the network goes again with the same `opId`s, and a change asked again gets the first answer without publishing its events twice.

  Another session's changes arrive as the events of their items, and an undo's events carry `origin.undoOf`. Results' `meta` carry `opId` and `undoable`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Field groups on the cloud engine:
  - `doc.security.allowsField(...)` answers per field, from the token's scope.
  - The token's `identity` no longer carries `groups`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `doc.forms.reorderCalculations()`, and `forms.calculationsReordered` from other sessions.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `doc.forms.export`, `doc.forms.import` and `doc.forms.importValues` over HTTP: the export read at the manifest's pins with the stale-pin retry, the imports as one multipart request each, checked against the server's limits first. Audit rows `form.import` and `form.importValues` become one `forms.created` or `forms.valueSet` event per field.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `doc.forms.list()` reads the immutable `form@formsVersion` leaf (the base's while the layer inherits the `forms` plane); `page.forms.renderAppearances()` reads `form/pages/{p}/appearances@`. `doc.forms.updateWidget()`. Form writes absorb the form's pins and own the `forms` plane, so a fill leaves every annotation URL shared.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `doc.forms.deleteWidget()` on the cloud engine (`DELETE …/form/widgets/{pageKey}/{annotKey}`); remote `form.deleteWidget` rows become `forms.widgetDeleted`, and widget restores move the form's pins.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) –
  - `doc.security.fieldRights()`: the groups the handle may fill in, sign and assign.
  - `doc.forms.applyEffects` is removed: write a script run's effects as one change with `doc.apply`. The `forms.effectsApplied` event is gone with it.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) –
  - `PageLayout.tabOrder` and a list box's `topIndex`.
  - A widget's `fontFamily` reads back as a free text's does. Changing a widget's colour or size keeps its font.
  - Setting a field to the value it holds writes nothing and can't be undone.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `baseUrl` is optional: an engine that names no server connects to CloudPDF SaaS, `https://engine.cloudpdf.com` (exported as `CLOUDPDF_SAAS_URL`). `cloudEngine()` takes no options at all for the SaaS; your own `@cloudpdf/server` still names itself, `cloudEngine({ baseUrl })`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `page.render.image()` draws form fields, as the local engine does. A left-out option draws what the token may read, and the picture is fetched from its family's path (`render/pages`, `render/annotations`, `render/fields` or `render/all`), shared from the base while the layer inherits every plane it draws.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Page handles and page services take `PageRef` addresses, request pages as `/pages/obj:N/…`, and surface the new page-identity record shapes and events.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Align cloud document operations with the revised engine API, including durable
  page references, annotation transfer and drawing data, form and signature
  operations, and page-space coordinates. Add custom metadata operations and
  keep cloud document handles and event delivery in sync with these contracts.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The cloud engine's `pages.reorder()`, `annotations.reorder()` and `forms.reorderWidgets()`, with positions on insert. A reorder moves only its own family's pins; remote `annot.reorder`, `pages.reorder` and `form.reorderWidgets` rows become the same events as locally.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The cloud engine says `canOpenFiles: false`: it opens the documents your server holds (`'id'`, `'token'`, `'share'`), never a file's bytes, so a viewer on it offers no way to open a file from the user's computer.

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Reads the import limits from `/v1/access`'s `bundleLimits`. Bundle exports and imports share one multipart reader and writer.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `forms.attachWidget` and `forms.detachWidget` send the widget's `AnnotationRef` as `body.widget`; widget records on the wire carry `ref`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Sends and reads every multipart message in the one envelope: a `body` part naming each file by role, and `resource:<key>` file parts. A single-file write keys its file by its role's name.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Page renders draw annotations only when a document token's scope (or `/access`) says the caller may read them; without either, the server decides. `includeFormFields: true` is refused: cloud pictures don't draw form fields yet. `security.allowsAnnotation` treats widgets as form design. Rows the server withholds from the event stream advance the cached manifest's pins and publish no events.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Every open document is its own editing session, with its own session id and HTTP client, even when one engine opens the same document twice. Before, an engine's opens shared one session: two opens of one document could be handed the same object numbers, so one of their creates was refused, and each dropped the other's changes as its own echo. Documents opened by id with the engine's token also shared one CDN binding, so all but the last read from the origin. A document opened with its own token now keeps the engine's `docAffinityHeader` and `onRetry`.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The cloud engine takes its document event stream and its ids from `@embedpdf/engine-core`, so it no longer imports `@embedpdf/engine-services`, the local engine's host.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Widgets turn by `rotation` (quarter turns, clockwise), and a box kind can be created by its `rect` with a quarter turn.

## 3.0.0-next.14

### Minor Changes

- [#827](https://github.com/embedpdf/embed-pdf-viewer/pull/827) by [@bobsingor](https://github.com/bobsingor) – Expose page measurement calibration and viewport reads in the cloud engine, and deliver viewport change events with document version coherence.

- [#800](https://github.com/embedpdf/embed-pdf-viewer/pull/800) by [@LazyCompiler](https://github.com/LazyCompiler) – Cloud-backed search honours the `ignoreWhitespace` query flag, which travels inside the search token, and search cursors are pinned to it: replaying a cursor minted with the flag against a query without it (or vice versa) is rejected with `InvalidArg`, matching the local engine.

## 3.0.0-next.13

### Minor Changes

- [#812](https://github.com/embedpdf/embed-pdf-viewer/pull/812) by [@bobsingor](https://github.com/bobsingor) – Add `doc.signatures` for cloud-backed signature inspection, revision analysis, and two-phase signing. Read signed bytes from immutable document versions and refresh the manifest after preparing or completing a signature.

  Support visual appearances on unsigned signature fields and publish their form update events.

## 3.0.0-next.12

### Minor Changes

- [#803](https://github.com/embedpdf/embed-pdf-viewer/pull/803) by [@bobsingor](https://github.com/bobsingor) – The cloud engine implements `page(pon).annotations.flatten` over `POST …/annotations/pages/{pon}/items/flatten` (content and annotation planes patched in place, `annotations.flattened` published) and `page(pon).annotations.exportAppearance` over `POST …/items/appearance` (PDF bytes; a read).

  It also implements `pages.setName` and `pages.removeName` over `POST …/pages/names` and `POST …/pages/names/delete`. Both advance only `docVersion` and `layoutVersion`, so the cached manifest is patched in place, per-page render/text/annotation leaves stay valid, and the result carries the fresh layout including `namedPages`.

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Action trees parsed from the hosted engine now carry full interpreter payloads (the discriminated `PdfActionNode` union) and `DocumentActionsSnapshot.openDestination`; the snapshot schema defaults `openDestination` so responses from older deployments still parse. Cloud actions conformance now gates the payload matrix and the destination-form `/OpenAction` on the HTTP + native-runtime path.

## 3.0.0-next.10

### Minor Changes

- [#788](https://github.com/embedpdf/embed-pdf-viewer/pull/788) by [@bobsingor](https://github.com/bobsingor) – Add coherent whole-document annotation snapshots using annotation versions
  and audit heads, including stale-version retries and desync-safe hydration.
  Expose per-record annotation creation, mutation, and group-assignment
  permission checks through the cloud document security service.

## 3.0.0-next.9

### Minor Changes

- [#772](https://github.com/embedpdf/embed-pdf-viewer/pull/772) by [@bobsingor](https://github.com/bobsingor) – Implement page insertion, blank-page creation, and page extraction in the
  cloud document pages service. Insertions invalidate stale manifest rows and
  publish local or realtime `pages.inserted` events with the updated layout.

## 3.0.0-next.8

### Minor Changes

- [#783](https://github.com/embedpdf/embed-pdf-viewer/pull/783) by [@bobsingor](https://github.com/bobsingor) – Use the document-scoped access endpoint for unlock requests. Add an
  opt-in `docAffinityHeader` option for routing document requests and
  bounded retries for server `EngineBusy` and `EngineRestarting`
  responses, including `Retry-After` handling and an `onRetry` callback.

## 3.0.0-next.7

## 3.0.0-next.6

## 3.0.0-next.5

### Minor Changes

- [#759](https://github.com/embedpdf/embed-pdf-viewer/pull/759) by [@bobsingor](https://github.com/bobsingor) – Support full-fidelity page text snapshots and character-space search ranges through the cloud engine transport. Remote text extraction now preserves the same character-to-text mapping and search-to-selection semantics as the local engine.

## 3.0.0-next.4

### Minor Changes

- [#749](https://github.com/embedpdf/embed-pdf-viewer/pull/749) by [@bobsingor](https://github.com/bobsingor) – `open({ kind: 'share' })`: the engine resolves public share tokens itself.
  - The share arm exchanges `shr_…` for a session JWT on the engine's own transport (`baseUrl` + configured `fetch`) and delegates to the `token` arm, so the handle binds to a self-renewing source — revoking or editing the share retargets the open at the next renewal. Works on an engine constructed with no engine-level token at all.
  - Exchange failures surface as `EngineError`s — on `open()` and on every later renewal (RPCs, SSE reconnects) — never as raw `ShareExchangeError`s. Protected grants reject with the new `EngineErrorCode.SharePasswordRequired`; the wire code and HTTP status ride in `details`, the original error in `cause`. The mapping is exported as `engineErrorFromShareExchange`.
  - `shareSessionSource` now declares its concrete return type (`() => Promise<string>`) instead of the `TokenSource` union; `HttpClient` exposes `baseUrl` and `fetchImpl` getters.

## 3.0.0-next.3

## 3.0.0-next.2

### Minor Changes

- [#730](https://github.com/embedpdf/embed-pdf-viewer/pull/730) by [@bobsingor](https://github.com/bobsingor) – Adds share-session support, the client half of the no-backend embed flow.
  - Adds `exchangeShareToken`, which trades a public share token for a short-lived document session, and `ShareExchangeError`, whose `code` names the outcome (`SharePasswordRequired`, `OriginNotAllowed`, `ShareExpired`, `NotFound`).
  - Adds `shareSessionSource`, a caching token source that re-exchanges shortly before expiry and shares one in-flight exchange between concurrent callers. Because the transport resolves its token source on every request and on stream reconnect, renewal needs no timers and no listeners.
  - Requires no change to `open()`: an exchanged session is an ordinary document-scoped JWT, so a share source feeds `open({ kind: 'token' })` unchanged, and each open keeps its own credential.

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the CloudPDF implementation of the Engine v3 interface. It gives browser applications the same document API as the local engine while executing PDF operations remotely through CloudPDF over HTTPS.
