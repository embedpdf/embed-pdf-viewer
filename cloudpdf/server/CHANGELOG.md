# @cloudpdf/server

## 3.0.0-next.17

### Minor Changes

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – Archive share links instead of losing what their visitors made. Archiving (migration 041) stops a link's exchange for good, like a revoke, but keeps the link and its visitors' layers, still listed with `documents.layers.list?shareId=` and downloadable. Deleting a link is refused with 409 while its visitors have layers; one whose visitors only looked can still be deleted. An archived link refuses updates, is left out of `shares.list` unless `archived=true`, and no longer keeps its shared layer from being deleted. Its visitors' layers keep to the link's idle setting.

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – Incremental downloads no longer go through the engine. A layer's PDF saved incrementally, the default, is now its base file followed by the delta its stored artifact holds, streamed from storage with the same permission and password checks as before; a layer nobody wrote downloads as its base file, and a signed file's bytes stay exactly as stored. A rewrite (`mode=rewrite`) is still saved by the engine.

  Download links: `POST …/layers/{layerName}/download-link` returns a URL that downloads the layer's current PDF without an Authorization header, for services that only take a plain URL. The URL is the layer's versioned download with a `link` token that opens nothing else: it isn't accepted as a bearer token, it works only for the version it was made for (404 once the layer changes), it expires after `expiresIn`, and a password-protected document is checked when the link is made. Deployments that verify tokens with their own keys can mint the same link on their backend, as a doc token with `layer_name` and a `download` claim.

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – Delete a layer with `DELETE /v1/tenants/{tenantId}/documents/{id}/layers/{layerName}`. Its artifacts, renders, change captures, changes, audit rows, signings, password sessions and object numbers go, and its worker session closes. A layer that was written keeps its row as a tombstone (migration 037), and every route then answers its name with `LayerDeleted` (HTTP 410), because its read URLs were cached as immutable and a new layer under the name would restart at the same versions. A layer nobody wrote leaves no tombstone and stays usable. A write in flight on another replica loses its commit to the delete. Deleting a layer a share link uses is refused with 409, and a share link can't be created for a deleted layer.

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – List a document's layers with `GET /v1/tenants/{tenantId}/documents/{id}/layers`: newest first, cursor-paged like documents, tenants and shares, optionally only one share link's visitors' layers (`shareId`). This is how a link's owner finds what visitors filled in and downloads it through the layer's routes. Migration 040 replaces the per-document layer index with one in list order.

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – Share links can ask their visitors who they are. A link's `visitorIdentity` names the fields it asks (`displayName`, `email`, `title`, `organization`, `organizationalUnit`, each required or optional), when it asks (`'on-open'` or `'before-first-change'`), and the owner's `purpose` and `privacyUrl`. The exchange takes the answers as `visitorIdentity`; until the required ones are given, a link that asks on open answers 422 `VisitorIdentityRequired`, and one that asks before the first change issues the session with `visitor.identityRequest` and refuses its writes with 403 `VisitorIdentityRequired`. Answers are stored once per visitor (migration 042, `share_visitors`), with the time they were given, and go into every token issued for them as its `identity`; an answer once given is never replaced, and a visitor who starts over is a new visitor who is asked again. `GET /v1/tenants/{tenantId}/shares/{shareId}/visitors` lists a link's visitors (who answered or made a change) newest first with their layer, and `DELETE …/visitors/{visitorId}` erases a visitor's answers and layer, on archived links too. A link with visitors is archived rather than deleted (409). The idle clock is now the visitor's: `visitorIdleSeconds` (renamed from `visitorLayerIdleSeconds`) deletes the visitor and their layer once unseen that long, only on links that set it.

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – Share links can give each visitor a layer of their own. Every exchange names a visitor: the session token carries them as the author (`identity.userId` `visitor_<id>`), and a handle, an HMAC the link issued, brings them back on renewal. On a per-visitor link the session pins the visitor's layer, `visitor-<id>`, which is made at their first write and stamped with the link, the visitor and when they were last seen (migration 038); each exchange with the handle restarts that idle clock. `restart: true` deletes the visitor's layer and starts a new visitor, and a visitor whose layer was deleted comes back as a new one. Names starting with `visitor-` are refused for a link's shared layer and for issued tokens.

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – Deleting share-link visitors' layers is now the link owner's choice. A link's `visitorIdleSeconds` is null by default, and a visitor's layer then stays until it is deleted on purpose, since what a visitor filled in is often the only copy; migration 039 moves links on the earlier 7-day default to it. A link that sets an idle time, for throwaway layers like examples, has the sweeper delete its visitors' layers nobody has seen for that long; a visitor with the document open renews and stays seen. A visit through a share link now counts as one view however often its session renews: the visitor handle carries the signed time it was issued, and an exchange whose handle is newer than the session lifetime plus five minutes continues the visit.

### Patch Changes

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – Opening a document to edit no longer creates its layer. A layer nobody has changed reads the base document, so `/access` hands its editing session object numbers counted past the base document's last object, without storing the layer or opening a worker session for it. The layer is stored at its first write. Object numbers are now kept by document and layer name (migration 036), and numbers a layer was handed on one base version start over on another. The sweeper forgets the numbers of layers nobody changed once their editing sessions have been expired for a session lifetime, so someone who only looked leaves nothing behind.

  Layer worker sessions no longer stay open for the life of the document. The sweeper closes a layer's session after it goes unused for `layerSessionIdleMs` (default 10 minutes), and a document keeps at most `maxLayerSessionsPerDoc` layer sessions open (default 32), closing the least recently used beyond that. The next request reopens a closed session from the stored layer. Searching a layer whose text and page order are still the base document's now runs on the base, without opening a session for the layer.

  A write retried on two replicas under the same change id now answers what the first one committed, also when that commit spent the write's object numbers while the second was still preparing.

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – Versioned reads without a CDN now answer `Cache-Control: private, max-age=31536000, immutable` instead of `public, …`. Only the caller's browser may keep a response that needed a token; a proxy in front of the engine no longer may. Deployments with a CDN keep `public`, because the edge checks the signature before serving its copy.

## 3.0.0-next.16

### Minor Changes

- [#891](https://github.com/embedpdf/embed-pdf-viewer/pull/891) by [@bobsingor](https://github.com/bobsingor) – Attachments are changes: `POST …/changes` takes `attachments.create` (its file as a `resource:<key>` part) and `attachments.delete` under `doc.attachments.modify`, and undoes them by `opId`. The routes `POST …/attachments` and `DELETE …/attachments/{fileKey}` are removed, and file downloads no longer carry `X-EmbedPDF-File-Name` and `X-EmbedPDF-File-Type`: the listing has both. New current reads: `GET …/attachments`, `GET …/attachment-files/{fileKey}/data` and an annotation's `GET …/items/{annotKey}/resources/file`.

- [#885](https://github.com/embedpdf/embed-pdf-viewer/pull/885) by [@bobsingor](https://github.com/bobsingor) – The document's outline: `GET /v1/docs/:docId/outline@{token}` (shared and cacheable while a layer inherits the outline and the layout) and `GET /v1/docs/:docId/layers/:layerName/outline`, with outline edits through `POST …/changes`. Layers and published versions carry an outline version (migration `035_outline_version`), outline ops move it, and its plane decides when a layer reads the shared outline. A token that may change the outline (`doc.outline.modify`) is handed object numbers for new items, as one that may create annotations is.

- [#890](https://github.com/embedpdf/embed-pdf-viewer/pull/890) by [@bobsingor](https://github.com/bobsingor) – Page edits are changes: `POST …/changes` takes `pages.rotate`, `pages.reorder`, `pages.delete`, `pages.insertBlank` and `pages.insert` (its PDF as a `resource:<key>` part) under `doc.pages.assemble`, and undoes them by `opId`. An undo of a delete brings the same pages back with fresh page pins, so no picture cached before they went is served for them. The routes `POST …/pages/reorder`, `/pages/rotate`, `/pages/delete`, `/pages/insert` and `/pages/insert-blank` are removed.

- [#883](https://github.com/embedpdf/embed-pdf-viewer/pull/883) by [@bobsingor](https://github.com/bobsingor) – `POST /v1/docs/:docId/layers/:layerName/pages/extract` takes `flatten` (`{ usage?: 'display' | 'print' }`), `includeAnnotations` and `includeFormFields`, and returns the pages as they draw for that usage. A flattened copy passes on `doc.download` or `doc.download.flattened` (a signed document refuses the latter), and paints only what the token may read; the include options are refused without `flatten`.

- [#883](https://github.com/embedpdf/embed-pdf-viewer/pull/883) by [@bobsingor](https://github.com/bobsingor) – Serve the print pictures at both tiers: each picture family printed at 150 DPI under `render/print/` (needs `doc.print`) and at 300 DPI under `render/print-high/` (needs `doc.print.high`), on top of the family's own rights. A print picture's token is its pins and its format; the server sizes it from the DPI and the paper. Print pictures are cached at their versioned URLs but never stored or refused by the render lattice.

## 3.0.0-next.15

### Minor Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The appearance endpoint returns every mode and state an annotation stores, each manifest entry labelled with its `state`, and accepts `modes` as a filter. Annotated page renders draw form fields unless the token says `formFields=false`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `/v1/access` advertises the bundle limits as `bundleLimits`, and the app option is `bundleLimits`. The multipart reader for bundle imports serves any bundle family; annotation imports are unchanged.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Stops work for clients that went away: a request whose client disconnects before its reply is sent now aborts its engine job, where before no disconnect was ever detected. A render shared by several requests stops only once all of them have left.

  Serve the revised document, page, annotation, form, and rendering contracts, including object-number page references, page-space geometry, annotation transfer, custom metadata, and signature-aware mutation checks.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Every layer write sends its worker job an `opId`: the request's `Idempotency-Key`, or one minted for the write. Results' `meta` carry `opId` and `undoable`; page-structure, metadata, attachment and signing results take them from the write.

  Add `POST /v1/docs/{docId}/layers/{layerName}/changes`: user actions, each a change whose ops apply in order in one layer transaction, all or none, or `{ opId, undoOf }`, the undo of an earlier change. One request runs as one worker job and one commit: each change stands on its own (a refused one rolls back alone), and the 200 answers every change in order, applied with its result or refused with its error. Bytes travel as multipart `resource:<key>` parts the JSON names by key. At most 64 changes per request and 512 ops per change.

  Each answered change keeps its answer under its `opId` in the new `change_outcomes` table (migration 033), refusals included, so a retry gets the same answer and a different change under an answered `opId` is refused (`IdempotencyKeyReused`). An applied change keeps what undoes it: a record beside its answer and its captures as one object-store blob. Only the user who made a change may undo it; a redaction, a flatten, a form repair or a completed signature ends undo for the changes before it (`layers.undo_horizon`, `UndoUnavailable`). Answers are kept 30 days (`CLOUDPDF_CHANGE_RETENTION_DAYS`); the sweeper deletes expired answers with their captures, and the records and captures of changes no undo can reach.

  Every change that wrote gets one audit row (kind `change`, its `opId` as idempotency key, `undo_of` naming what an undo undid). The single-op annotation, form and metadata routes now run as one-change requests: their audit rows keep their kinds and payloads, and their `Idempotency-Key` names the change, so `{ undoOf }` undoes them.

  The event stream's rows carry `undoOf`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Form writes stamp field attribution from the token's identity: creating a field, filling one in, and the values a script run writes.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Field groups on the server:
  - **Fill and sign routes** (a value, a reset, a signature look, a values import, signing) accept a token that may fill in or sign some field: `doc.forms.fill` / `doc.sign`, or a `fields:` scope. The write checks each field against the token's grants.
  - **Design routes** send the grants too, for the group checks.
  - **Identity:** the verified identity claim drops `groups`, and `/v1/access` no longer echoes it.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `POST …/form/calculations/reorder` (`doc.forms.reorderCalculations`, audit kind `form.reorderCalculations`). Creating or updating a field with scripts takes `doc.forms.script` too.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Form bundle routes replace `form/data`: `GET …/form/export@:token` (doc and layer, cacheable at the form and layout pins), `POST …/form/export` for a selection a URL can't carry, and multipart `POST …/form/import` and `POST …/form/import-values`, each one change under its `Idempotency-Key`, audited as `form.import` and `form.importValues`. The FDF/XFDF content-type parsers are gone.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The form is its own read family:
  - **New routes:** `form@{formsVersion}` and `form/pages/{p}/appearances@{widgetVersion}`, each with its layer twin (and an unversioned layer appearance route), needing `doc.forms.read`; `PATCH …/form/widgets/{pageKey}/{annotKey}` (`doc.forms.updateWidget`).
  - **Pins:** migration 034 adds `layers.forms_version`, `base_versions.forms_version` and `widget_version` on page rows. Form writes move the form's pins, never the annotation pins; annotation writes the reverse. Page insert/delete, flatten and redaction move both. Plane scopes compare the document pins too, and gain `forms`.
  - Annotation reads and appearance batches hold no widgets.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `DELETE /v1/docs/:docId/layers/:layerName/form/widgets/:pageKey/:annotKey` deletes a widget (`doc.forms.modify`), audited as `form.deleteWidget`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) –
  - `POST /v1/docs/:docId/layers/:layerName/form/effects` is removed: a script run's effects are one change, `POST …/changes`.
  - A reset of fields already at their defaults, or a display that changes no widget, writes nothing: it can't be undone.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) –
  - Pages report their tab order and list boxes their top row.
  - A widget update that changes only its colour or size keeps its font; a free text's border colour change keeps its font.
  - A value write that changes nothing records no undo step.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – An annotation import is a change: kept in the change outcomes under its `Idempotency-Key` with the record that undoes it, so `POST …/changes` with `{ undoOf }` undoes and redoes it, and a retry is answered from the outcome. Still audited as `annot.import`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Every multipart request and answer has one shape: a JSON `body` part, and each file as a part `resource:<key>` that the body names by role, `resources: { <role>: <key> }`. Annotation create and update, page insert, attachments, a signature's drawn appearance, signature prepare and change ops name their files this way; bundle imports and exports and appearance batches call their JSON part `body`, and an appearance batch's images are `resource:<key>` parts. A named key with no part, and a part nothing names, are refused.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Serve the four page picture families at both tiers: `render/pages`, `render/annotations`, `render/fields` and `render/all` (renamed from `render/annotated`, which now draws form fields too). Each takes `doc.render` plus the read of what it draws, pins the page counters of the planes it draws, and is stored under its own family.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Serve page routes under `:pageKey` (`obj:N`; malformed keys answer 400), accept `pages`/`page` refs in page mutation, extraction, redaction and weak-session bodies, and emit `PageRef` page identity in every response and event while keeping storage keyed by page object number.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `POST …/pages/reorder`, `POST …/annotations/pages/{pageKey}/items/reorder` and `POST …/form/widgets/{pageKey}/reorder` replace the move routes; page inserts take a `position`. Audit kinds `annot.reorder`, `pages.reorder` and `form.reorderWidgets`. A reorder bumps only its family's pins: annotation reorders the annotation pins, widget reorders the form's.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Widget placements and widget updates take `actions`. Creating a field, adding a widget or updating one with a script, submit or URI action takes `doc.forms.script` too.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Check the caller's authority over an annotation inside the engine's write for updates and deletes, instead of reading the page first: the check and the write see the same document, and each request makes one engine call. The engine checks an update's patch against its annotation's kind.

  Page flatten and redaction apply fail as a whole when a page fails, leaving the document unchanged; their responses no longer list `'failed'` or `'skipped'` pages.

  Address annotations as `:annotKey` = `obj:N` or `base:N` on every annotation route; remove the weak annotation session routes, the `index` update and delete route, page revision tokens and the weak annotation columns (migration `031`). Manifest pages are `{ page, cache }`, and annotation reads and write results carry `PageRef`s.

  `ObjectNumberUnavailable` and `LayerFull` answer HTTP 409.

  Hand object numbers to editing sessions (migration `032`). An editing session is the client's `X-Engine-Session-Id` together with the token's subject, and lives 15 minutes past its last sign of life. `/access` opens one for a caller that may create and hands it numbers (the body's `objectNumbers`, the response's `edit`); a write tops it up when asked with `EmbedPDF-Reserve-Object-Numbers` and answers `EmbedPDF-Object-Numbers`; `POST /v1/docs/:docId/layers/:layerName/object-numbers` reserves up to 1,000 at once; the event stream sends a `session` event and keeps the session alive. Creates name their numbers in the query string (`objectNumber`, `objectNumbers`, `widgetObjectNumbers`, `splitObjectNumber`), and a number the session doesn't hold is refused `not-held`. What a write makes for itself is numbered past every number handed out, and a publish drops the numbers handed out on its layer.

  Every layer write route takes `Idempotency-Key`: a retry gets what the first request committed, and no numbers.

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Annotation records are typed `Annotation` (was `AnnotationDTO`).

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The widget attach and detach routes accept the widget's `AnnotationRef` as `body.widget`; widget records on the wire carry `ref`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Security fixes:
  - **Pictures with annotations need `doc.annotate.read`,** at the origin and in CDN grants. They draw no form fields.
  - **The event stream sends each connection only what its token may read.** Annotations need `doc.annotate.read`; widgets and form fields need `doc.forms.read`. A row with nothing left goes out marked `withheld`, with only its pins.
  - **Moving annotations checks each one inside the write,** so moving a widget takes `doc.forms.modify`.

## 3.0.0-next.14

### Minor Changes

- [#827](https://github.com/embedpdf/embed-pdf-viewer/pull/827) by [@bobsingor](https://github.com/bobsingor) – Persist page measurement calibration in layer artifacts with authorization and audit events. Calibration advances the document version while retaining existing page cache versions and annotation scales.

- [#800](https://github.com/embedpdf/embed-pdf-viewer/pull/800) by [@LazyCompiler](https://github.com/LazyCompiler) – The layer search routes (`/v1/docs/:docId/layers/:layerName/search/{rects,full}/data`) accept `ignoreWhitespace=true` alongside the other query flags and forward it to the engine, so a cloud search for `invoice` finds a letter-spaced `i n v o i c e`. Combining it with `regex=true` is rejected with `InvalidArg`, and the flag is carried by the search tokens that page through results.

## 3.0.0-next.13

### Minor Changes

- [#812](https://github.com/embedpdf/embed-pdf-viewer/pull/812) by [@bobsingor](https://github.com/bobsingor) – Add durable two-phase digital signing with prepare, complete, abort, and expiry handling. Persist candidate data so completion can run on another replica, verify the supplied CMS, and reject completion when the document or layer has changed.

  Publish each completed signature as an immutable document version while retaining the document ID and version history. Consume the signing layer's edits into the new base and refresh document state across replicas.

  Add signature inspection and analysis routes, immutable version and revision downloads, and visual signature-field appearances. Use files and streaming storage transfers for signing candidates, with configurable temporary storage and signing expiry.

## 3.0.0-next.12

### Minor Changes

- [#803](https://github.com/embedpdf/embed-pdf-viewer/pull/803) by [@bobsingor](https://github.com/bobsingor) – Add `POST /v1/docs/{docId}/layers/{layerName}/annotations/pages/{pon}/items/flatten` (flatten a chosen set of the page's annotations; gated like page flatten and persisted the same way — one page's content and annotation versions advance) and `POST …/items/appearance` (the chosen annotations' appearances as one single-page PDF; gated by `doc.download`, no-store).

  Add `POST /v1/docs/{docId}/layers/{layerName}/pages/names` and `POST …/pages/names/delete` to register, rename, or remove a `/Names /Pages` entry on a layer. Both are page-structure mutations gated by `doc.pages.assemble`: the worker writes a new layer artifact and the doc and layout versions advance, exactly like a page move, with no new resource, version, or cache scope. `/layout` responses now include `namedPages`.

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Action reads served by `/v1/docs/:docId/actions@:token` (and the layer-scoped variant) now include interpreter payloads on every executable node and the destination-form `/OpenAction` as `openDestination`, via the shared engine-services reader. The wire representation of action nodes changed shape (payload-carrying discriminated union); deploy server and clients from the same prerelease train.

## 3.0.0-next.10

### Minor Changes

- [#788](https://github.com/embedpdf/embed-pdf-viewer/pull/788) by [@bobsingor](https://github.com/bobsingor) – Persist per-layer annotation versions and add versioned page and
  whole-document annotation reads with audit-head metadata. Expose a no-store
  backend endpoint for listing every annotation in a layer. Annotation mutations
  now advance the version atomically so clients can hydrate and retry against
  coherent snapshots.

## 3.0.0-next.9

### Minor Changes

- [#772](https://github.com/embedpdf/embed-pdf-viewer/pull/772) by [@bobsingor](https://github.com/bobsingor) – Add document routes for inserting PDF pages, creating blank pages, and
  extracting selected pages. Insert mutations persist the new page set and
  versions atomically and publish audit events for realtime collaborators.

### Patch Changes

- [#787](https://github.com/embedpdf/embed-pdf-viewer/pull/787) by [@bobsingor](https://github.com/bobsingor) – Reusing an explicit `docId` on `documents.init` or `documents.import` now answers a clean `409 Conflict` explaining how to proceed (retry with the same `idempotencyKey` to resume, delete the document to replace it, or use a different/omitted `docId`) instead of surfacing the raw database unique-constraint error as a 500 — including the case where a retry mints a fresh idempotency key per attempt. A `docId` already owned by another tenant answers `403`, mirroring the existing delete semantics.

- [#785](https://github.com/embedpdf/embed-pdf-viewer/pull/785) by [@bobsingor](https://github.com/bobsingor) – Fix AWS S3-backed streaming uploads by buffering small source chunks before the SDK applies checksum framing, preventing `InvalidChunkSizeError` during document imports and other streamed writes. Handled 5xx responses now also emit structured error logs with the request ID and HTTP status.

## 3.0.0-next.8

### Minor Changes

- [#783](https://github.com/embedpdf/embed-pdf-viewer/pull/783) by [@bobsingor](https://github.com/bobsingor) – Add a production Helm chart with validated SQLite and Postgres profiles, safety gates, smoke and crash drills, and OCI publishing tied to the server package version. Add Prometheus metrics, drain-aware bounded shutdown and readiness, serialized Postgres migrations, and fail-fast worker supervision.

  Add opt-in supervised engine-host process isolation with generation-fenced recovery, crash journaling, document quarantine enforcement, engine health reporting, and audited quarantine CLI commands. Repeated engine crashers can be observed or rejected with `DocumentQuarantined`, while native host crashes restart the engine without terminating the API server.

  Encode page renders, annotation appearances, and warm thumbnails inside engine workers by default so compressed images cross the engine boundary, with a temporary API-side encoding fallback. Add bounded interactive and background scheduling, per-host memory telemetry, controlled engine recycling, and deterministic engine sharding with per-shard readiness and metrics.

  Add `POST /v1/docs/:docId/access` as the document-scoped access endpoint while retaining `POST /v1/access` as a transitional alias. Head responses advertise the scoped endpoint, and path/body document ID mismatches are rejected. Allow the optional `X-CloudPDF-Doc` affinity header through CORS and expose retry and image metadata response headers to browser clients.

## 3.0.0-next.7

### Patch Changes

- [#771](https://github.com/embedpdf/embed-pdf-viewer/pull/771) by [@bobsingor](https://github.com/bobsingor) – Accepts bodyless requests that carry `Content-Type: application/json` instead of failing them with an unhandled 500.
  - An empty JSON body now parses as no body rather than `FST_ERR_CTP_EMPTY_JSON_BODY` — the shape the generated PHP, Go, and Ruby SDKs (and clients with default JSON headers) send for bodyless calls such as document delete. Non-empty bodies still go through Fastify's default parser, keeping its prototype-poisoning protection, and routes that require a body still reject its absence with a 400.
  - The error handler now honors Fastify's `statusCode` on framework errors, so parser and payload rejections (empty or malformed JSON, body limits) surface as the 4xx client errors they are instead of being logged and returned as "unhandled error" 500s.

## 3.0.0-next.6

### Minor Changes

- [#766](https://github.com/embedpdf/embed-pdf-viewer/pull/766) by [@bobsingor](https://github.com/bobsingor) – Add durable asynchronous document imports backed by the `document_imports` job table and an in-process worker with one claim loop per replica. Document and job creation is atomic, lease-token-fenced transitions prevent stale workers from overwriting replacements, reconcile-on-claim avoids duplicate transfers after crashes, and exhausted retries fail the document and clean destination bytes. Retries stay pinned to one content identity, filesystem sources require `expected.sha256`, and queued or running imports are protected from the stale-pending sweeper. Migration 027 stores the re-drivable source descriptor in `source_json`.

- [#766](https://github.com/embedpdf/embed-pdf-viewer/pull/766) by [@bobsingor](https://github.com/bobsingor) – Add operator-registered import connections through `CLOUDPDF_IMPORT_CONNECTIONS` for S3 and S3-compatible stores, GCS, Azure Blob, and filesystem roots. Connections enforce credential classes, tenant allowlists, scoped prefixes or tenant-bound key templates, provider-specific revision pinning, and fail-closed authorization. Canonical backend fingerprints reject self-imports, and each import records sanitized source provenance and outcome in the new `document_imports` table from migration 026. A shared conformance suite keeps URL and connection adapters aligned on source-opening behavior.

- [#766](https://github.com/embedpdf/embed-pdf-viewer/pull/766) by [@bobsingor](https://github.com/bobsingor) – Implement server-side PDF imports from caller-supplied URLs through the existing document lifecycle. Deployment policy controls size, timeout, concurrency, HTTPS, and public-network requirements; URL handling blocks private and metadata addresses with DNS pinning, rejects redirects, and requires `Content-Length`. Imports enforce optional size and SHA-256 pins, sanitize failures so URL secrets do not leak, leave documents pending after retryable transport failures, and add the `pull` upload kind in migration 025.

### Patch Changes

- [#766](https://github.com/embedpdf/embed-pdf-viewer/pull/766) by [@bobsingor](https://github.com/bobsingor) – Mount the document import handler under the renamed `documents.importFrom` contract operation and align the server's import policy and lifecycle terminology. The HTTP route and runtime behavior remain unchanged.

- [#766](https://github.com/embedpdf/embed-pdf-viewer/pull/766) by [@bobsingor](https://github.com/bobsingor) – Cloud ObjectStore adapters (S3, GCS, Azure Blob) now truly stream `put` bodies: a `Readable` is hashed and length-enforced as it flows (constant memory) instead of being buffered whole. Under- or over-delivery aborts before a visible object can appear, any prior object at the key survives a failed attempt, and the SHA-256 metadata is attached post-stream (S3 via a same-key server-side copy). FsObjectStore now cleans up its `.partial` file when the source stream errors mid-put.

## 3.0.0-next.5

### Patch Changes

- [#760](https://github.com/embedpdf/embed-pdf-viewer/pull/760) by [@bobsingor](https://github.com/bobsingor) – Keep connected licenses usable during Keygen's three-day `EXPIRING` window by relying on the signed validation decision instead of the informational status label. Licenses whose expiry has elapsed remain denied.

## 3.0.0-next.4

### Patch Changes

- [#750](https://github.com/embedpdf/embed-pdf-viewer/pull/750) by [@bobsingor](https://github.com/bobsingor) – Preserves configured CORS response headers on the hijacked server-sent events stream, allowing browser clients on permitted origins to subscribe to document layer events.

## 3.0.0-next.3

### Minor Changes

- [#748](https://github.com/embedpdf/embed-pdf-viewer/pull/748) by [@bobsingor](https://github.com/bobsingor) – Derives the connected usage-reporting credential from the license key, so a connected deployment is configured with `CLOUDPDF_LICENSE_KEY` alone.
  - Computes the reporting credential as `cpr_v1_` + base64url(HMAC-SHA256) over a domain-separated message that binds the signed `cloudpdfLicenseId` license metadata, so the wire credential is one-way (it can never reveal the license key) and never authenticates another license record.
  - Retires `CLOUDPDF_LICENSE_REPORTING_TOKEN`. A deployment that still sets it boots normally; the variable is ignored and the server logs a warning asking for its removal.
  - Existing connected deployments upgrade by removing the retired variable. During the coordinated verifier cutover on the CloudPDF side a usage report may answer 401; reports retry every five minutes with cumulative counters, so no usage is lost and license validation is unaffected.
  - Air-gapped deployments are unchanged and continue to send no telemetry.
  - Pins fixed cross-runtime derivation test vectors shared with the CloudPDF control plane.

- [#746](https://github.com/embedpdf/embed-pdf-viewer/pull/746) by [@bobsingor](https://github.com/bobsingor) – Fixes presigned-upload materialization and makes commit-time sha verification single-read and constant-memory.
  - Fixes the range materializer crashing with `EBADF` whenever an object carried no SHA metadata — the shape of every presigned browser upload. The failure was silent: commits still reached `ready` while the security probe recorded `unknown` and thumbnail warming recorded `failed`. The hash fallback now closes the write-only handle and streams the finished partial from disk, guards against short positional writes, and rejects a metadata/expected-sha disagreement before paying for the download.
  - Replaces the S3 and FS `getSha256` fallbacks that buffered whole objects in RAM with streaming hashes — constant memory regardless of document size.
  - Commit now verifies uploaded bytes with a single object-store read when a base-file cache is wired (`DocumentLifecycleOptions.fileCache`): the upload is materialized into the cache, hashed on the way down, and reused by the security probe instead of being downloaded a second time. `LocalFileHandle.sourceKey` reports which object key materialized a content-addressed entry, so a cross-key cache hit still triggers a direct verification of the committing document's own object.
  - Adds a typed `ShaMismatchError` (exported) thrown by all `materializeLocal` implementations, letting callers distinguish declared-hash mismatches from retryable transport failures.
  - Surfaces previously swallowed failures: `DocumentSecurityProbeOptions.onError`, `DerivedRenderServiceOptions.onWarmError`, and base-file-cache `materialize-error` events are now wired to the server log.

## 3.0.0-next.2

### Minor Changes

- [#730](https://github.com/embedpdf/embed-pdf-viewer/pull/730) by [@bobsingor](https://github.com/bobsingor) – Implements share grants, origin locking, per-tenant usage, and tenant suspension.
  - Stores share grants whose row id is the public share token, carrying document capabilities, an optional origin allowlist, an optional scrypt-hashed passphrase, a session TTL, and an optional expiry. Editing or deleting a grant retargets every embedded copy of its token at the next exchange.
  - Serves the public `POST /v1/share-sessions` exchange, which validates origin, passphrase, expiry, disablement, and tenant suspension before minting a document session JWT. Unknown, revoked, disabled, and suspended grants answer alike so the existence of a grant is never disclosed, and the route carries its own per-IP and per-grant limiters rather than the authentication-failure budget.
  - Enforces an optional `origins` claim on document tokens for every request that arrives with a browser `Origin` header, covering both share sessions and backend-minted tokens. Requests without the header are governed by the token itself.
  - Adds CORS through `CLOUDPDF_CORS_ORIGINS` (`*` to reflect, or a comma-separated allowlist), which browser-direct deployments need. Bearer tokens remain the security boundary; per-credential origin locks carry the origin policy a server-wide list cannot express.
  - Records per-tenant usage facts for views, uploads, and stored bytes, readable at `GET /v1/tenants/:tenantId/usage`. A view is a share exchange or an authorized `/v1/access` grant, counted once across the two. These counters hold no limits and are separate from license metering.
  - Adds `tenants.suspend` and `tenants.resume`, which fail every tenant JWT, document JWT, and share exchange closed while leaving the root API token free to inspect, resume, or delete the tenant.
  - Mounts token revocation from the CLI through `CLOUDPDF_ENABLE_REVOCATION`.
  - Records share and suspension lifecycle events in the security-event trail, and adds matching SQLite and PostgreSQL migrations plus origin, passphrase, and end-to-end share coverage.

- [#734](https://github.com/embedpdf/embed-pdf-viewer/pull/734) by [@bobsingor](https://github.com/bobsingor) – Adds integrity-pinned uploads with presigned storage transfer preferred and a
  policy-controlled multipart proxy fallback.

  Hardens filesystem-backed storage against path traversal, storage-root deletion,
  and recursive deletion through symbolic links.

## 3.0.0-next.1

### Major Changes

- [#720](https://github.com/embedpdf/embed-pdf-viewer/pull/720) by [@bobsingor](https://github.com/bobsingor) – Adds the tenant-scoped backend API and root API-token workflow to the self-hosted CloudPDF server.
  - Replaces the legacy flat admin routes with contract-backed `/v1/tenants/:tenantId` document, tenant, token, and deployment operations.
  - Adds constant-time root API-token authentication alongside delegated tenant JWT authorization.
  - Adds tenant lifecycle and provenance tracking, keyset pagination and state filtering, and cascade deletion for tenant-owned data.
  - Adds document and tenant token issuance, revocation, and durable security-event auditing.
  - Allows API tokens on document-plane routes and supports per-request `X-Document-Password` authorization through HMAC proofs or non-mutating checks against the canonical PDFium session, including credential-safe open singleflight behavior.
  - Adds matching SQLite and PostgreSQL migrations plus expanded registry, authorization, password, and end-to-end coverage.

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the self-hostable CloudPDF document server. The Fastify service combines authentication, durable storage, native PDF processing, realtime document events, and commercial license enforcement behind the Engine v3 HTTP API.
