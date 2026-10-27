# @embedpdf/engine-core

## 3.0.0-next.17

### Minor Changes

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – Add `wirePaths.layerDownloadLink` and its template, the route that makes a short-lived download URL for a layer's PDF.

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – Add the `LayerDeleted` error code: the cloud layer was deleted, what it held is gone, and its name is refused from then on.

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – `OpenInputShare.restart` starts over on a share link that keeps each visitor's layer, and `DocumentHandle.share` (`layerMode`, `keep`) says how a document opened from a share link reaches its layer.

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – New engine code `VisitorIdentityRequired`: a share link asks who the visitor is, and its `details` (`VisitorIdentityRequest`: `fields`, `missing`, `invalid`, `purpose`, `privacyUrl`) say what; `visitorIdentityRequestOf(error)` reads them. `OpenInputShare.visitor` sends the visitor's answers (`VisitorAnswers`) with the open. `DocumentHandle.share` is now a `DocumentShare`: besides `layerMode` and `keep`, `identityRequest` says what the link asks before the first change, `identify(answers)` answers it, `onIdentityRequest` is called when a change waits for the answers, and `decline()` lets the waiting changes fail.

## 3.0.0-next.16

### Minor Changes

- [#891](https://github.com/embedpdf/embed-pdf-viewer/pull/891) by [@bobsingor](https://github.com/bobsingor) – Attachments are change ops: `attachments.create` (the file's name, type and description, its bytes as the `file` resource) and `attachments.delete`, each recorded with its reverse, so `doc.apply({ undoOf })` undoes and redoes them. An undo of a delete brings the same file back, with its bytes, description and dates, and publishes `attachments.restored`. `attachmentVerbs()` makes `doc.attachments.create()` and `delete()` one-op changes. `doc.attachments.download()` returns the bytes; the name and type are what the listing says, as for an annotation's `downloadResource(ref, 'file')`. `ATTACHMENT_LIMITS.decodedBytes` names the local engine's decode limit, and `AttachmentWireComponents` the attachment models. `wirePaths` no longer lists the attachment write routes; `wireTemplates` gains the current attachment reads.

- [#885](https://github.com/embedpdf/embed-pdf-viewer/pull/885) by [@bobsingor](https://github.com/bobsingor) – Read and edit the document's outline (its bookmarks) with `doc.outline`: `get()` lists every item depth first with its parent, its target in page space (read the way a link's is), its `/A` action tree, its colour, its style and whether it opens; `create`, `update`, `move` and `delete` are change ops (`outline.create`, `outline.update`, `outline.move`, `outline.delete`) that apply through `doc.apply`, undo by reference, and publish `outline.created`, `outline.updated`, `outline.moved`, `outline.deleted` and `outline.restored` events. Items are named by object number and placed by neighbour (`OutlinePosition`); a delete takes the items under an item with it, and its undo brings the same items back. Writing needs the new `doc.outline.modify` capability (granted by the PDF's modify or assemble right, and protected by certifying signatures).

  `outlineItemOfDraft`, `outlineItemAfter` and `outlineItemWithChildren` work out what an outline write leaves before the engine runs it, and `runOutlineConformance` checks both engines against them. `actionTreeOf` gives the action tree a link target is written as. The cloud wire carries the outline plane: `LayerScopes.outline`, `outlineVersion` in the manifest and in `CacheDelta`, and the `outline` and `layer-outline` resources.

- [#890](https://github.com/embedpdf/embed-pdf-viewer/pull/890) by [@bobsingor](https://github.com/bobsingor) – Page structure edits are change ops: `pages.rotate`, `pages.reorder`, `pages.delete`, `pages.insertBlank` and `pages.insert`, each recorded with its reverse, so `doc.apply({ undoOf })` undoes and redoes them. An undo of a delete brings the same pages back under the same refs, with their annotations and names, and publishes `pages.restored`. `pageVerbs()` makes the structure verbs of `doc.pages` one-op changes, so each verb's `opId` undoes it. `wirePaths` and `wireTemplates` no longer list the single page write routes.

- [#883](https://github.com/embedpdf/embed-pdf-viewer/pull/883) by [@bobsingor](https://github.com/bobsingor) – `pages.extract(pages, options)` makes a copy of the pages as they draw: `{ flatten: { usage: 'print' } }` is a print copy, with the annotations and form fields that print painted into the pages, nothing interactive left and layers in their print state; `flatten: {}` is the copy as shown on screen. `includeAnnotations` and `includeFormFields` choose what is painted, with a page picture's defaults, and are refused without `flatten`. A flattened copy needs `doc.download` or `doc.download.flattened`, and paints only what the caller may read; `resolvePageExtract()` is that check, shared by both engines. The wire schema of `POST …/pages/extract` takes the options, and `runPrintCopyConformance` checks a print copy against the print picture on any engine.

- [#883](https://github.com/embedpdf/embed-pdf-viewer/pull/883) by [@bobsingor](https://github.com/bobsingor) – Page pictures can be made for paper. `usage: 'print'` with `viewport: { kind: 'dpi', dpi: 150 | 300 }` draws the page by the print rules: layers in their print state, and only the annotations and form fields with the `print` flag (no-view ones included, hidden ones never). The DPI counts on the paper the page prints on, A4 or Letter: a bigger page gets no more pixels than it needs shrunk to fit. A print picture is the whole page, upright, on white, so it takes no `target`, `rotation` or `background`, and a `dpi` viewport is for print pictures only. It needs `doc.print`, and 300 DPI `doc.print.high`.
  - **Options:** `PageRenderOptions` gains `usage`, and `PageRenderViewport` the `dpi` kind; `PageScreenViewport` is the screen sizes alone, which appearance renders take. `checkRenderUsage()` checks a render's usage, and the caller's rights when it knows them; `printDpiOf()` reads a print picture's DPI. `PrintDpi` and `PagePrintRights` name them.
  - **Size:** `renderSize()` and `pageTransform()` size a `dpi` viewport for its paper (`printScale()`, `PRINT_PAPER`).
  - **Paths:** each picture family has a print family at each tier, `render/print/…` (`doc.print`) and `render/print-high/…` (`doc.print.high`), with the family's planes and pins. The tier is a right, so it is a path of its own, and the CDN signs it only for a session with that right. `PAGE_PRINT_FAMILIES`, `PAGE_PICTURES`, `pagePictureOf()`, `wirePaths.docPagePrint`, `layerPagePrint` and their `…Current` twins, and `PagePrintQuerySchemas`.
  - **Conformance:** `runPrintRenderConformance` and its fixture `PRINT_RULES_PDF`.

- [#891](https://github.com/embedpdf/embed-pdf-viewer/pull/891) by [@bobsingor](https://github.com/bobsingor) – A change crosses the worker in page space both ways (`DocumentApplyWorkerRequest`, `DocumentApplyChangesWorkerRequest`, `ServerChange`, `ServerChangeOutcome` lose their coordinates parameter): each op is measured on the document as the ops before it left it, so one change can annotate a page and then delete it, or make a page and annotate it. The single page routes' input schemas (`PageReorderInputSchema`, `PageRotateInputSchema`, `PageDeleteInputSchema`, `PageInsertInputSchema`, `PageInsertBlankInputSchema`) are gone with the routes. The change conformance covers the new cases on both engines.

### Patch Changes

- [#895](https://github.com/embedpdf/embed-pdf-viewer/pull/895) by [@bobsingor](https://github.com/bobsingor) – Signature change analysis handles loops of unchanged objects (structure trees, outlines, popups) in one pass. A comment added to a tagged PDF (Chrome, Word) after an approval signature now reads `permitted` instead of `indeterminate`. In `ObjectReferrer` labels, `…` stands for a route inside a loop, as in `StructTreeRoot/…/Pg`.

## 3.0.0-next.15

### Minor Changes

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – One string key for an annotation address: `annotationKey(ref)` (`obj:<n>` for object numbers, which are document-unique; `nm:<page>:<name>` because `/NM` is only unique per page; `idx:<page>:<i>` for weak refs) and `refFromStableId(page, id)` to rebuild an address from an event's page and stable id. The page-qualified `refKey` is removed; thread and comment composition use `annotationKey`. The wire encoders `encodePageKey` and `encodeStableIdKey` are unchanged.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The annotation type is called `Annotation` (was `AnnotationDTO`), and each kind's read is `<Kind>Annotation` (`FreeTextAnnotation`, `StampAnnotation`, …); its schema is `AnnotationSchema`. A file attachment's read goes back into a create or an update: its `file` (with the size, checksum and dates a read adds) is taken as it is, and `null` is too, as on a create without it.

  A field an update takes back as read, with one schema for both (such as a popup's `parent`), accepts that schema once, nullable when the read is: its JSON Schema no longer lists the same type twice.

  The annotation export conformance suite pins the file today's runtime writes, whose appearance numbers take their shortest exact form.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `ImageSource`, an encoded image as a blob and an object URL (what `PageImageHandle` adds to its result), and `imageSourceOfBytes(bytes, contentType)` for a picture made on the device, to paint like one the engine rendered.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Appearance images now come with every look an annotation has. `renderAppearances()` returns each mode the annotation stores (at rest, under the pointer, pressed) and every state of each mode (a check box's `Off` and its on state), each image labelled with `mode` and the new `state`. `modes` is now a filter on both engines, defaulting to every mode; an empty list is refused with `InvalidArg`. Annotations gain `appearanceState` (their `/AS`), and the new `shownAppearances(appearances, annotations)` picks each annotation's look at rest in the state it shows. Page renders gain `includeFormFields`, which defaults to `includeAnnotations`, so a page rendered with its annotations now shows its filled form fields.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – What every bundle shares is its own module, ready for a second family: `BundlePage`, `BundleImportPages`, `BundleImportTarget`, `BundleKind`, `resourceIdOf` and `bundlePageMapping`; the limits are `BundleLimits` and `DEFAULT_BUNDLE_LIMITS`, and their messages name the bundle's kind; `bundleCodec()` makes a family's JSON file (`AnnotationTransfer` is one), with `BundleTransferOptions`. Renamed: `AnnotationBundleLimits` → `BundleLimits`, `DEFAULT_ANNOTATION_BUNDLE_LIMITS` → `DEFAULT_BUNDLE_LIMITS`, `AnnotationBundlePage` → `BundlePage`, `AnnotationImportPages` → `BundleImportPages`, `AnnotationImportTarget` → `BundleImportTarget`, `assertBundleManifest` → `assertAnnotationBundleManifest`, `AnnotationTransferOptions` → `BundleTransferOptions`; the access response's `annotationBundleLimits` is `bundleLimits` (`BundleLimitsSchema`). Annotation bundles, their files and their messages are unchanged.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `objectNumbersReferencedBy(change)`: every object number a change's ops refer to, next to `objectNumbersNamedBy`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Add changes: `doc.apply(change, options)` applies one user action as one transaction, its ops in order, all of them or none. A `Change` is `{ ops }` or `{ undoOf: opId }`; `ChangeOp` takes exactly the parameters of each single verb (annotations create, update, delete and move; form values, display, appearance text, reset, field create, update and delete, widget add and remove, signature appearance; metadata and custom metadata), with an optional `expect` that refuses the whole change with the new `ChangeConflict` when the document doesn't hold it. `ChangeResult` has one `ChangeItem` per op and the change's `meta`; an undo's items report what it left alone in `skipped`, and `annotations.restore` and `forms.restore` items name what came back. Add `isUndoChange`, `resolveChangeResources` and `changeEvents` (the events a change publishes, in op order).

  Every write's `meta` carries `opId`, the write's id (what `{ undoOf }` names), and `undoable`. Add the `annotations.restored` and `forms.restored` events, and the `UndoUnavailable` and `IdempotencyKeyReused` error codes.

  Add `ChangeAuthority` (an `AnnotationAuthority` with the document's signature `protection`), `authorizeCapability`, `authorizeUnprotected` and `authorizeAnnotationCreate`, so a write checks each of its ops inside the write. Add `annotationResourceBuffers`. Worker write requests require `opId`; add the `document.apply` worker request.

  Add `runChangeConformance` and `CHANGE_FIXTURE_PDF`.

  An undo's items report what it left alone: an op left alone entirely is a `SkippedChangeItem`, `{ type: 'skipped', op, meta }` naming the item it would have been (`isSkippedItem`), and an update item (`annotations.update`, `forms.update`, `forms.reset`, metadata) lists in `skipped` what it left alone. Add `ChangeItemType`, `changeFingerprint` (what a retry under the same `opId` must match) and `isKeptRefusal` (the refusals a change keeps under its `opId`). `AppearanceAction` gains `'restored'`: an undo put the appearance back as it was.

  Add the `POST …/changes` wire: `ChangeRequestSchema`, `ChangeResponseSchema` (with `ChangeOpWireSchema`, `ChangeEntryWireSchema`, `ChangeItemSchema`, `ChangeResultSchema`, `ChangeAnswerSchema`), `CHANGE_REQUEST_LIMITS`, and `wirePaths.layerChanges` / `wireTemplates.layerChanges`. Add the `document.applyChanges` worker request, which runs a request's changes in one job, each in its own transaction, and answers each with its result and record or its refusal.

  Add stable public component names for OpenAPI projections, like `AnnotationWireComponents`: `DocumentWireComponents` (`PageRef`, `CacheDelta`, `MutationMeta`, `DocumentMetadata`, `MetadataPatch`), `FormWireComponents` (`FormFieldRef`, `FormField`, `FormFieldValue`, `FormWidget`, `FormFieldDraft`, `FormFieldPatch`, `WidgetPlacement`, `FormMutationMeta`) and `ChangeWireComponents` (`ChangeOp`, `ChangeItem`, `ChangeResult`). `AnnotationWireComponents` gains `AnnotationRef`, `AnnotationDraft`, `AnnotationPatch`, `PdfLinkTarget` and `PdfLinkTargetWritable`.

  `FormFieldValueSchema` is one object holding exactly one of `value`, `checked` or `selectedValues`, and a `POST …/changes` entry one object holding exactly one of `ops` or `undoOf`, so the API reference can label every union; the `FormFieldValue` type is unchanged.

  Add `ChangeAnswer` (one change's answer from the server, applied or refused) and `objectNumbersNamedBy(change)`. `EventOrigin` gains `undoOf`: on the events of an undo, the `opId` of the change it undid.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Document events of this session's own mutations are published before the mutation's promise settles, in every engine; the document-events conformance suite checks it. `generateUuid` is exported for clients that tag a created annotation with its `/NM` before the engine confirms it. `positionKey(page, index)` is the key of the annotation at a position of a page's `/Annots` array, as a weak reference addresses it.

  Revise the engine contract around durable page references, page-space coordinates, upright text and annotation geometry, and one annotation data shape per kind. Add annotation bundle import and export, update form and signature operation shapes, and return the confirmed annotation record and rect from writes. Render targets, page transforms, image bytes, and event payloads follow the same document model across local and cloud engines.

- [#868](https://github.com/embedpdf/embed-pdf-viewer/pull/868) by [@bobsingor](https://github.com/bobsingor) – zod stays off the page. The root entry, `@embedpdf/engine-core/runtime` and `@embedpdf/engine-core/public` no longer import zod or build any schema, so an app's bundler never sees it on the main thread. The checks the engine runs where it runs, in its worker and on the server, move to a new entry, `@embedpdf/engine-core/validation`, built with zod:
  - `assertAnnotationDraft`, `pdfResolveAnnotationDraft`, `pdfResolveAnnotationPatch`, `planAnnotationImport`, `planFormImport` and `planFormValuesImport`, with the types `AnnotationImportPlan`, `PlannedAnnotation`, `FormImportPlan`, `PlannedFormField`, `PlannedValueWrite` and `FormValuesImportTarget`, are exported from `@embedpdf/engine-core/validation` instead of `/runtime` and the root entry;
  - `assertAnnotationPatch`, the update check `pdfResolveAnnotationPatch` runs, is exported there too. Like `assertAnnotationDraft`, it only accepts or refuses.

  `annotationImportFacts`, `formImportFacts` and `formValuesImportFacts` stay in `/runtime`.

  `annotationOfDraft`, `resolveAnnotationDraft`, `resolveAnnotationPatch` and `applyAnnotationPatch` predict a write without schema validation: what a viewer shows while a write is on its way. They prepare and derive a write with the same code the engine runs, and the engine's schema check between the two only accepts or refuses, so the engine writes what the viewer predicted. They still refuse, with `InvalidArg`, a field the kind doesn't declare, a changed subtype or `nm`, a `rect` with a new shape, a box kind that can't be placed, and what nothing can follow from; a value only the schema refuses (a color that isn't `'#rrggbb'`, an opacity above 1) is refused by the engine when the write reaches it, and a pending change it refuses leaves the view as any refused change does. A field an update sends back as it reads is not a change: the page and the engine both drop it, so nothing follows from it (a measured polygon that resends its vertices with a new color keeps its caption). A changed value stays, and the engine refuses one its kind can't write.

  Rects are finite everywhere: a rect or box with `Infinity` or `NaN` in it is refused, with `InvalidArg` on `rect`, by the prediction (`resolveRectCommand`, a box kind placed by its `rect`), by the engine's schemas, and by the wire's `PdfRectSchema` and `PageBoxSchema`, which used to accept `Infinity`.

  `ANNOTATION_RESOURCE_ROLES` has an entry for every kind (`{}` for a kind that takes no resources).

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Form fields say who created them and who last filled them in: `createdBy`, `createdAt`, `filledBy`, `filledByName`, `filledAt` and `importedBy`, stamped by the engine from the session's identity and stored in the field's own `/EMBD_Metadata`. A write that changes a value names its filler, a script's value counts as filled in by the user whose fill ran it, a reset and an anonymous fill name nobody, and undoing a fill puts the previous filler back. Widget rows report no attribution of their own: the field holds it. The form worker requests carry the `actor`. New suite `runFormAttributionConformance`.

  Two grant-only rights: `doc.forms.import` (an import keeps who created and filled in the fields; a signature removes it with `doc.forms.fill`) and `doc.forms.script` (write scripts, submit-form and URI actions into the form; a signature removes it with `doc.forms.modify`). `pdf.permissions` never expands either. Builders `caps.doc.forms.import()` and `caps.doc.forms.script()`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Field groups: each form field can belong to a group, its `groupId`. The group is who fills the field in, such as the buyer's fields, and is stored in the field's `/EMBD_Metadata /GroupID`.
  - **Fields:** a field's `groupId` is on `FormFieldDTO`, its draft and its patch. A new field goes in the session's own group (`identity.groupId`) unless the draft names another. A group can be changed, never removed. Widget rows report no group.
  - **Scopes:** `fields:<fill|sign|set-group|*>:<all|group=X>`, with `collab.fields.*` builders. A `fields:fill` scope narrows filling in, and `fields:sign` narrows signing, per action as for annotations. Form design (`doc.forms.modify`) is never narrowed, and `pdf.permissions` stays what the file allows. Any `fields:` scope lets the holder read the form.
  - **Checks:** `checkFieldAction`, `checkAnyFieldAction`, `authorizeFieldWrite`, `allowsFieldWrite`, `allowsSomeFieldWrite` and `authorizeFieldGroup`. `checkSetGroup` now takes the entity first: `checkSetGroup('fields' | 'annotations', group, own, scope)`.
  - **Security service:** `doc.security.allowsField('fill' | 'sign', field)` and `allowsField('set-group', { groupId })`.
  - **`group=X` compares only the record's group:** the session no longer has to be a member. `Identity.groups` is removed.
  - **Values import:** a values import leaves out a field the session may not fill in, with the reason `fill-not-allowed`.
  - **Worker protocol:** the form fill, design and signing jobs carry the caller's `authority` instead of an `actor`.
  - **Conformance:** `runFieldGroupsConformance` runs a buyer and seller contract (`FIELD_GROUPS_PDF`, `FIELD_GROUP_TOKENS`).

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A field's scripts can be written: `create()` and `update()` take `actions` (`FieldActionsPatch`: `keystroke`, `format`, `validate`, `calculate`, each a `FieldScriptWrite` or `null` to remove it; an event left out keeps its script). A field event takes JavaScript only. Writing a script takes `doc.forms.script` too (`writesScripts()`); removing one does not.

  The calculation order follows the calculate scripts: a script puts the field at the end, removing it or deleting the field takes the field out. New `doc.forms.reorderCalculations(fields, position)` (`FieldPosition`), its change op `forms.reorderCalculations` and event `forms.calculationsReordered`, answering the whole order. Results of `create`, `update` and `delete` carry `calculationOrder` when they changed it. Undo puts scripts and the order back.

  New write shapes for actions: `PdfActionWrite` (JavaScript, go-to, URI, named, hide, reset-form, submit-form, with `next`), `actionWriteOf()` (a read tree as a write), `fieldScriptOf()`, `isFieldScript()`, `needsScriptRight()`. New suite `runFormScriptConformance`; the change round trips cover scripts and the order.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Form bundles replace FDF/XFDF. `doc.forms.export(selection)` takes whole fields out as a `FormBundle` (each field with its widgets, value, scripts, actions and attribution; a signature and a `noExport` value never travel); `doc.forms.import(bundle, options)` copies the design and `doc.forms.importValues(bundle, options)` fills fields of the same name, each one change you can undo, answered again on a retry. New: `FormBundle`, `FormTransfer` (one JSON file), `FormExportSelection`, `FormImportOptions`, `FormValuesImportOptions`, `FormImportResult`, `FormValuesImportResult`, the drop reasons, the pure planners `planFormImport` and `planFormValuesImport`, `formImportFacts` and `formValuesImportFacts`, `FormImportOp`, the wire schemas, paths, resources (`form-export`, `layer-form-export`) and the export token, and `allowsCapability()`. Removed: `FormDataFormat`, `FormDataExport`, the FDF/XFDF `FormImportResult`, the `forms.imported` event and the `form/data` paths. New conformance suite `runFormTransferConformance`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A form field's widgets come with the form, never with the annotations:
  - **`doc.forms.list()` returns `widgets`:** every widget's row (place, look, state and its `field`), beside the fields. `doc.annotations.list()` and `page.annotations.list()` hold every annotation except widgets. `FormFieldWidget` loses `rect`; read a widget's place from its row. `SignatureDTO.widget` loses it too, and the signature types are no longer generic.
  - **`page.forms.renderAppearances()`** renders a page's widget images, every mode and state; `page.annotations.renderAppearances()` renders the rest.
  - **`doc.forms.updateWidget(widget, patch)`** and the `forms.updateWidget` change op change a widget's place and look, with `forms.widgetUpdated`. `annotations.create`, `annotations.update` and `annotations.delete` refuse widgets with `InvalidArg`.
  - **Form results carry the widget rows they changed** (`widgets`), and `forms.restored` too.
  - **Pins and planes:** `DocumentManifest.formsVersion`, `CachePins.widgetVersion`, `CacheDelta.formsVersion` and a `forms` plane in `LayerScopes`. New read families `form@` and `form/pages/{p}/appearances@` (resources `form`, `page-form` and their layer twins, `doc.forms.read`), with their tokens, paths and query schemas.
  - `AnnotationFamily` and `familyOfSubtype`; the conformance suites read widgets from the form.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) –
  - **`doc.forms.deleteWidget(widget)`** deletes a widget: it leaves its page, and its field when it has one, and answers that field (`null` for a widget in no field). A merged field/widget is refused with `InvalidArg` naming `doc.forms.delete`. The change op `forms.deleteWidget` (with `expect`) is undone by `forms.restoreWidget`, which brings the widget back at its place and into its field; events `forms.widgetDeleted` and `forms.widgetRestored`.
  - **Annotation import leaves out every widget**, in a field or not: the drop reason `'form-field'` is now `'widget'`.
  - **Conformance:** `runWidgetFindingConformance` (where the form finds a widget in awkward files: only in `/Annots`, inline, no `/AcroForm`, a stale `/P`, a deleted page, no field type) and `runPermissionConformance` (reads, appearance images, pictures, writes and events through an everything, a fill-only and a comment-only token). `pdfOf` is exported for tests.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – `FormWidgetRef` is now `FormWidget`: a widget as the field tree sees it, carrying `ref: AnnotationRef | null`, the widget's annotation address computed once by the engine (present exactly when the widget is an indirect object placed on a page). `formWidget(objectNumber, page)` is the one constructor. `forms.removeWidget` takes the widget's `AnnotationRef` instead of a raw record, and `forms.addWidget` takes a placement and creates the widget.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The form rules, for a viewer to show a form write before the engine answers:
  - `fieldAfterValue`, `fieldAfterReset`, `widgetsAfterDisplay`, `formFieldOfDraft`, `formFieldAfter` and `widgetAfterPatch` give the field or widget a write leaves, by the rules the engines write by (a text value cut to its maximum length, check boxes and radio buttons in unison, list options in option order, a reset to the default). `runFormPredictionConformance` checks them against each engine.
  - `doc.security.fieldRights()` lists the groups the handle may fill in, sign and assign (`fieldRightsOf` for a scope).
  - Widgets: `borderStyle` can be `'underline'`, `dashArray` is the dash of a dashed border, and check boxes and radio buttons have a `checkStyle` (`null` is the family's own mark).
  - A form write's `meta.redrawnWidgets` lists the widgets whose pictures it changed.
  - `doc.forms.applyEffects` is removed, with its `forms.effectsApplied` event: a script run's effects are one change, `doc.apply({ ops: formEffectOps(effects) })`. A `forms.setDisplay` op takes no `expect`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) –
  - A checkbox's or radio group's value is the checked widget's on-state name (`fieldAfterValue`, `fieldAfterReset`); a default that names a widget by position picks that widget.
  - `PageLayout.tabOrder`: the order a page's annotations take keyboard focus in (`/Tabs`), or `null`.
  - A list box's `topIndex`: the option in its top row (`/TI`).
  - A widget's `fontFamily` names a font as a free text's does: a standard font's name, a registered font's key, or the family of a font the document has.
  - `freeTextFontForFace` and `familyKey` (font faces to names), `defaultEntryOfDraft` and `topRowOf` are engine-core's.
  - `assertChoiceDefault`: a dropdown's or list box's default is checked against its options (free text only for a dropdown that allows editing). The engine and the predictions refuse the same drafts and updates.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – An annotation import is a change: `AnnotationImportOp`, the op `doc.annotations.import` runs, and `RecordedOp` / `RecordedChange`, what the engine runs and records (a change's ops, or an import). `doc.apply` takes no import, so writing restored attribution stays the import's. A change's items can be `annotations.import`, an import's own answer, and `changeEvents` publishes it as one `annotations.created` per annotation. New `itemWrote()`: whether an item wrote (an import that left every item out didn't). The import conformance suite covers undo and redo, a changed annotation left alone, a retry, a final write ending undo, and the import's rights.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Every multipart message has one shape: a JSON `body` part, and each file as a part `resource:<key>` that the body names by role, `resources: { <role>: <key> }`. New key schemas (`ResourceKeySchema`, `AnnotationResourceKeysSchema`, `AppearanceResourceKeysSchema`, `FileResourceKeysSchema`, `SourceResourceKeysSchema`, `ImageResourceKeysSchema`). `WireAttachmentFile` names its file as `resources.file`; a page insert's body names its source as `resources.source`; a signature's drawn appearance and a prepare's artwork are `resources.appearance`, and so is the `forms.setSignatureAppearance` change op on the wire. An appearance batch's entries name their image as `resources.image`. Renamed: `AnnotationAppearanceManifest` → `AnnotationAppearanceBatch` (and its entry and schema), `AnnotationImportManifest` → `AnnotationImportBody` (and its schema).

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Page pictures come in four families, by what they draw beside the page content: nothing, the annotations, the form fields, or both. `PAGE_RENDER_FAMILIES` is the one table of what each draws, needs, depends on, pins and where its path is. `render/annotated/` is renamed `render/all/` and now draws form fields too, and `render/annotations/` and `render/fields/` are new.
  - **Paths:** `wirePaths.docPageRender`, `layerPageRender` and their `…Current` twins take the family.
  - **Resources:** `page-render-annotations`, `page-render-fields` and `page-render-all`, with their `layer-` twins, replace `page-render-annotated`, and CDN coverage grants each by its own rights and planes.
  - **Tokens:** a picture's token carries its family's pins, `widgetVersion` included, and `PageRenderQuerySchemas` holds one schema per family.
  - **Codec:** `pageRenderOptionsFromImageOptions` takes what to draw from the parsed options.
  - **Types:** `PageRenderLayers` names what a picture draws.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Address pages by `PageRef` everywhere. A page's identity is `{ kind: 'objectNumber', objectNumber }`, built with `toPageRef(n)` and compared with `pageRefsEqual`; `encodePageKey`/`decodePageKey` give it the `obj:N` wire form that mirrors `annotKey` and `fieldKey`.

  `DocumentHandle.page(ref)`, `pages.move/rotate/delete/flatten/extract(pages: PageRef[])`, `pages.setName({ name, page })`, `annotations.listRaw(page)` and `beginWeakEdit(pages)` take refs. `PageLayout.ref` and `PageHandle.ref` replace `pageObjectNumber`, and every record that points at a page carries `page: PageRef`: `AnnotationRef`, `AnnotationDTO`, `RevisionToken`, `PageState`, `FormWidgetRef` (`null` when unplaced), `PdfDestination`, `SearchMatch`, `NamedPageTarget`, cache deltas and comment threads. Document events carry `page`/`pages`; `PageInsertResult.insertedPages` and the per-page items of flatten, redaction and scale results carry `page`. Weak-annotation session requests and responses use `pages`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `pdf.permissions` grants what Acrobat allows on the file. A file that allows changing the document (bit 4) now also allows filling in, signing and assembling pages. Fill and sign come with bit 4, 6 or 9, and assembly with bit 4 or 11. Form design still needs both bit 4 and bit 6. The scope resolver and the permission advisory (`advisoryFromPdfBits`) both read the bits through `materializePdfPermissions`, so the three can no longer disagree.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `pdf.permissions` gives `doc.text.search` and `doc.text.select` whatever the file's copy flag says, as Acrobat finds and selects text in a file that forbids copying. The copy flag (bit 5) governs taking the text out: `doc.text.copy` and `doc.content.copy`, and through them a search's snippets. A copy-protected document is searchable, with matches but no snippets, and its text selectable, but not copied.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Permission fixes:
  - **Widgets are form design.** Creating, changing, moving or deleting a widget through the annotation calls takes `doc.forms.modify`. The `annotations:…` permissions never apply to widgets, and a widget patch can't set `groupId`. `allowsAnnotation('update' | 'delete', widget)` answers the same way: `AnnotationOwner` gains `subtype`.
  - **Page pictures draw what the caller may read.** Left out, `includeAnnotations` draws the annotations when the caller may read them (`doc.annotate.read`), and `includeFormFields` the form fields when they may read the form. Asking for either when the caller may not read it is refused with `Forbidden`, naming the option. The new `resolvePageLayers` helper applies this rule.
  - **Cloud pictures and permissions.** Cloud pictures with annotations need `doc.annotate.read`, and they draw no form fields; the render token loses `formFields`.
  - `runAppearanceStatesConformance` takes `pageRendersDrawFormFields`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Push buttons can be created: `PushButtonFieldDraft` (`family: 'pushbutton'`, widgets only) and `PushButtonFieldPatch` (the settings every field has). A widget's new `caption` (`/MK /CA`) is a push button's caption, read and written on its row, its placement and `updateWidget()`; every other widget reads `null`, and a caption written to one is refused. `SignatureFieldDraft` and `SignatureFieldPatch` are exported too.

  A widget's appearance follows the rule every annotation does: a move keeps it (`rect` is translatable geometry), and so do the widget's field, family and actions (inert keys); only a change to its look draws it again.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Every move names a neighbour, never an index, and each family has its own reorder verb:
  - **`ListPosition`:** `{ before: ref }`, `{ after: ref }`, `'start'` or `'end'` (`PagePosition`, `AnnotationPosition`), with `anchorOf`, `positionIndex`, `reorderedList` and `reorderPart`.
  - **`doc.pages.reorder(pages, position)`** replaces `pages.move(pages, toIndex)` (`PageReorderInput`, `PageReorderResult` with the moved `pages`, `pages.reordered`). `pages.insert(bytes, position?)` and `pages.insertBlank(spec, position?)` take a position; `pages.inserted` loses `toIndex`.
  - **`page.annotations.reorder(refs, position)`** replaces `annotations.move(refs, toIndex)`: it answers the page's whole new `order` as refs and publishes `annotations.reordered`. **`doc.forms.reorderWidgets(widgets, position)`** restacks a page's widgets, with `forms.widgetsReordered`. Widgets paint above every annotation, so each verb takes and anchors on its own family only: the other family is `InvalidArg` naming the right verb, a neighbour that's gone `NotFound`, one of the moved rows `InvalidArg`.
  - **Change ops** `annotations.reorder` and `forms.reorderWidgets` (no `expect`) replace `annotations.move`; their undo puts each row back beside its old neighbours.
  - **Annotation and widget rows lose `index`;** `PageLayout.index` stays. `annotationMoveEvents`, `AnnotationMoveResult`, `PageMoveResult` and `FormWidgetsMoveResult` are gone.
  - Wire paths `…/items/reorder`, `…/pages/reorder` and `…/form/widgets/{pageKey}/reorder`, with their body and result schemas.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `Engine` has `canOpenFiles`: whether `open()` takes a file's own bytes (`{ kind: 'bytes' }`), such as a file someone picked on their computer. Every engine sets it; the local engine says `true`, the cloud engine `false`.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `EventHub` and `SessionEventPublisher`, the in-process `DocumentEventStream` both engines publish their document events on, are exported from `@embedpdf/engine-core/runtime`, next to the stream they implement.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A widget's actions can be written: `doc.forms.updateWidget()` takes `actions` (`WidgetActionsPatch`: `activate` and the widget's other events, each a `PdfActionWrite` or `null` to remove it; an event left out keeps its action; `actions: null` removes them all), and so does each widget placement of `create()` and `addWidget()`. A read's `actions` passed back unchanged keeps them. Undo puts them back. Destinations are in page space, as everywhere.

  An action that runs a script, submits or opens a URI takes `doc.forms.script` too; go-to, named, hide and reset-form need `doc.forms.modify` alone. `writesScripts()` takes a widget patch, and a read's trees count as none; new `draftWritesScripts()` covers a draft's field and widget actions. New `widgetActionsOf()` (a widget's read actions as a patch), `WIDGET_ACTION_EVENTS`, `WidgetActionEvent`, and the schemas `PdfActionWriteSchema` and `WidgetActionsPatchSchema` (named components `PdfActionWrite`, `WidgetActionsPatch`). `runFormScriptConformance` covers widget actions.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Widgets turn. A widget reads like every kind that turns: `box` (the frame its contents are laid out in), `rotation` (a clockwise quarter turn, `/MK /R`; `null` upright) and `rect` (where it stands, worked out). A placement takes `rotation` and its `rect` or its `box` (`placedWidgetOf` works out the rect; with both, `box` is the shape); an update takes `box`, `rotation` or `rect`. Every kind that turns as a box (square, circle, free text, stamp, caret, widget) can be created by its `rect` with a quarter turn instead of its `box` (`rect` at another angle is refused), and an update's `rect` now resizes a box at a quarter turn along its own sides. New `quarterTurnOf()`, `pdfQuarterTurnBox()`, `PlacedDraft`; `pdfRectTurnedBounds()` is exact at quarter turns; a create's `rect` is typed as a box. New conformance suite `runWidgetRotationConformance` with `TURNED_FIELDS_PDF`; the rotation suite covers create by `rect`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Add `AnnotationAuthority`, with `authorizeAnnotationUpdate` and `authorizeAnnotationDelete`: an annotation update or delete carries who it acts for and the caller's grants, and the engine checks them against the annotations the write finds, inside the write. The `annotations.update` and `annotations.delete` worker requests take `authority` in place of `actor` and `checked`.

  Remove `SessionKind`: every document opens as an immutable base with an editable layer.

  `PageFlattenResult` and `RedactionApplyResult` report each page as `'applied'` or `'unchanged'` only: the `'failed'` and `'skipped'` statuses and the per-page `error` are gone, because a page that fails now fails the whole call.

  An annotation's ref is its name for life, in one of two kinds: `{ kind: 'objectNumber', page, objectNumber }`, or `{ kind: 'baseIndex', page, baseIndex }` for an annotation the uploaded file stores inline, named by the position it was born at in its page's `/Annots`. Remove the `index` and `nm` ref kinds; an annotation's `nm` is data only. `AnnotationRef` replaces `AnnotationStableId` everywhere: `meta.changed` and the `annotations.deleted` event's `deleted` are `AnnotationRef[]`, `annotationKey(ref)` is the one string key (`obj:42`, `base:<page>:<i>`), and `encodeAnnotKey`/`decodeAnnotKey` give a route's `:annotKey` (`obj:42`, `base:2`).

  Remove page revisions and weak annotations: `PageState`, `identityQuality`, `weakRefsInvalidated`, `shouldRefetch`, weak edit sessions (`doc.annotations.beginEdit`, `DocumentHandle.capabilities`) and the `InvalidReference` and `WeakAnnotationSessionConflict` error codes. `meta.affectedPages`, `AnnotationList.pages` and an appearance result's `page` are `PageRef`s; a manifest page is `{ page, cache }`.

  Every write takes its options last: `WriteOptions`, with an `opId` that names the write. Every event a write publishes carries it as `origin.tx`, `{ id, index, count }`; without one the engine makes one up. An `opId` is 1 to 255 visible ASCII characters (`opIdOf` checks it), on every engine. A create's bytes move into the options: `page.annotations.create(data, { resources, objectNumber, opId })` and `update(ref, patch, { resources, opId })`, in place of a positional `resources`.

  Name objects before they exist. `DocumentHandle.objectNumbers` is the session's `ObjectNumberPool` (`take()`, `held`, `reserve(count)`, `onLost(listener)`). A create that names one of its numbers makes its object at exactly that number: `page.annotations.create(data, { objectNumber })`, `pages.insertBlank(spec, toIndex, { objectNumbers })`, `forms.create(draft, { objectNumber, widgetObjectNumbers })` and `forms.addWidget(ref, placement, { objectNumber, splitObjectNumber })`. Add the `ObjectNumberUnavailable` error (`details.reason` `'not-held'` or `'taken'`) and `LayerFull`, past `OBJECT_NUMBER_CEILING`; `ObjectNumberRange`, `objectNumbersIn` and `OBJECT_NUMBER_ISSUE_LIMIT`; the `objectNumbers.reserve` worker request, and the open requests' `objectNumbers` and `reserveObjectNumbers`.

  Add `generateUuidV7`. A prediction (`annotationOfDraft`) takes the engine's `nm` from its context, like the ref. Add `runObjectNumberConformance`.

  Add the cloud editing session to the wire: `formatObjectNumberRanges` and `parseObjectNumberRanges` (the `EmbedPDF-Object-Numbers` header), `EditSessionAccess` (`DocumentAccessInfo.edit`), `EditSessionStatus` (the event stream's `session` event), the access request's `objectNumbers`, and the bulk reservation's schemas and `wirePaths.objectNumbers`. Worker write requests take `objectNumberFloor`; opens, saved layer artifacts and `signatures.finalizeCandidate` report `lastObjectNumber`.

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) –
  - `widgetAfterPatch` works out where a widget stands after a move, a resize or a turn (`rect`: its box, with the sides swapped under a quarter turn), as the engine reads it back.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The redaction apply conformance suite checks that a mark's label is part of the page after apply, at a set size and fitted to its region.

  It also checks that several marks of a page applied together leave the page's other marks in place.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `origin.sessionId` names the open document (the handle) that made a change, not the engine: every open is its own session. `runPermissionConformance`'s `openSameDocument` receives the suite's engine.

## 3.0.0-next.14

### Minor Changes

- [#827](https://github.com/embedpdf/embed-pdf-viewer/pull/827) by [@bobsingor](https://github.com/bobsingor) – Add measurement DTOs, page calibration contracts, and shared distance, perimeter, area, and number-format helpers. Caption positions use PDF coordinates and support partial updates and explicit resets.

  Report invalid geometry for crossing, overlapping, or degenerate area boundaries while accepting either winding and an explicit closing vertex.

- [#800](https://github.com/embedpdf/embed-pdf-viewer/pull/800) by [@LazyCompiler](https://github.com/LazyCompiler) – Add the `ignoreWhitespace` flag to `SearchQuery`. A literal query folded with it drops whitespace on both sides instead of collapsing it, so `invoice` finds the letter-spaced `i n v o i c e` that OCR'd scans and tracked-out headings produce, and `total amount` finds `totalamount`. Hits still span the original text including the dropped whitespace, and `wholeWord` boundaries are checked on the original text. The flag is literal-only — `validateSearchQuery` rejects it together with `regex` (`ignore-whitespace-with-regex`) — and it round-trips through search tokens. `foldText` gains the matching `dropWhitespace` option, and the shared search conformance suite covers the flag.

## 3.0.0-next.13

### Minor Changes

- [#812](https://github.com/embedpdf/embed-pdf-viewer/pull/812) by [@bobsingor](https://github.com/bobsingor) – Add digital signature and document version types, signing permissions, events,
  wire schemas, and the optional `DocumentSignaturesService` API. Support
  signature-field authoring and appearances, file-backed layer inputs, file
  downloads, and configurable session and signed-document policies.

  Add revision change analysis and protection helpers that distinguish declared
  editing restrictions from the rules used to judge later modifications.

  Prevent excessive processing time when decoding malformed base64 containing long
  runs of padding characters.

- [#817](https://github.com/embedpdf/embed-pdf-viewer/pull/817) by [@bobsingor](https://github.com/bobsingor) – Add rich-text document types and schemas for FreeText annotation reads, drafts, and patches, including paragraph settings and per-run style overrides. FreeText reads now include a rich-text representation even for plain text, and custom font keys are accepted in response schemas.

  Add optional document font settings for embedding policy and typographic features, font identity and embedding-permission metadata, and explicit editing authorization for registered fonts.

## 3.0.0-next.12

### Minor Changes

- [#803](https://github.com/embedpdf/embed-pdf-viewer/pull/803) by [@bobsingor](https://github.com/bobsingor) – Selective annotation flatten and appearance export. `page(pon).annotations.flatten(refs, usage?)` is `pages.flatten` for a chosen set: painted annotations are removed from the page, ineligible ones (hidden for the usage, popups, no appearance) stay and report `skipped`, and the result (`AnnotationFlattenResult`) carries that page's new pins plus an `annotations.flattened` event. `page(pon).annotations.exportAppearance(refs)` returns the chosen annotations' normal appearances as one single-page PDF sized to their union rect — vector, positions preserved, the source untouched; all-or-nothing. Both are optional service members; `runAnnotationFlattenConformance` and `runAnnotationAppearanceExportConformance` lock the shared behavior.

  Named pages join the page list. `PageListSnapshot.namedPages` carries the catalog's `/Names /Pages` and `/Names /Templates` registrations in tree order — `NamedPageEntry` is the decoded key plus a target classified as `page` (a page in `pages`), `template` (a hidden `/Type /Template` page that is never listed or rendered), or `dangling`. Because a registration only means something against the page set that contains its target, it is layout data like `label` and shares the layout version rather than a plane of its own.

  `DocumentPagesService` gains two optional page-structure mutations: `setName({ name, pageObjectNumber, replace? })` registers a key, replaces what an existing key points at, or renames in one job; `removeName({ name })` drops a registration and keeps the page. Both return the fresh layout as `PageNameResult` (layout plus the docVersion/layoutVersion pins) and publish a `pages.named` event. Deleting a page removes every registration pointing at it. `runNamedPagesConformance` locks these invariants for every engine. The engine never interprets key text.

  Stamp `/Name` accepts any non-empty name — a standard stamp name or a custom identifier such as an Acrobat library's `#…` key — and a stamp patch may clear it with `name: null`.

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – The SubmitForm intent and the document's-home submit contract (Phase 4). The `submit-form` node grows an ATOMIC optional `payload` (`url` + `fields` + decoded `SubmitFormFlags` + `charSet?`; absent = older-runtime extraction, the node stays recognized-inert — partial states are unrepresentable). `decodeSubmitFormFlags` is the ONE ISO Table-240 decode (`exclude` derived from bit 1, never duplicated; bit 12 is `ExclFKey`, bit 13 reserved, `EmbedForm` is bit 14; bit 9 SubmitPDF dominates format with GetMethod kept alive). NEW: `doc.forms.submit?(request)` — the optional delivery-to-the-document's-HOME capability (present only where a home exists; the local engine truthfully lacks it), gated by the NEW grant-minted `doc.forms.submit` scope (no PDF permission bit exists for submission, so `pdf.permissions` never expands it); `FormSubmissionRequest`/`Receipt` DTOs + wire schemas fix the record shape (dataset entries + declared intent as METADATA — the home derives WHO submitted from its own verified session, and never fetches the PDF's URL). Conformance pins the payload extraction (`/UF` precedence, flag decode, both degrade shapes) in both flavors.

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – `PdfActionNode` is now a discriminated union carrying full interpreter payloads — a `goto` without its destination or a `uri` without its URI is unrepresentable. Executable arms: `javascript` (script), `goto` (destination), `uri` (+ `isMap`), `named`, `hide` (targets + `/H`), `reset-form` (`fields: PdfActionTargetRef[] | null` — null means `/Fields` was absent and every field resets — plus the exclude flag), the file-spec arms, and `rendition` with its optional `/JS`. Unreadable payloads degrade that node to `unknown` with the new `payload-dropped` tree warning. `DocumentActionsSnapshot` gains `openDestination` (the destination-form `/OpenAction`, schema-defaulted and mutually exclusive with `openAction`), `ActionReadBudget` gains target-entry and payload-text limits, and `PdfDestinationSchema` moved to a neutral `dto/` module (re-exported from its old home). The wire entry now also exposes `PdfActionWireComponents`, the stable named-schema registry used by API generators. This is a breaking source-level contract for code that constructed or narrowed action nodes, recorded as minor only because the `3.0.0-next` train is prerelease.

## 3.0.0-next.10

### Minor Changes

- [#788](https://github.com/embedpdf/embed-pdf-viewer/pull/788) by [@bobsingor](https://github.com/bobsingor) – Add annotation subjects, text review states, comment-thread composition, and
  coherent whole-document annotation snapshots. Extend document security with
  per-record collaboration checks, add versioned annotation wire resources and
  the public whole-document annotation path, and surface unrecoverable event
  gaps through `stream.desynced`.

## 3.0.0-next.9

### Minor Changes

- [#772](https://github.com/embedpdf/embed-pdf-viewer/pull/772) by [@bobsingor](https://github.com/bobsingor) – Add the required `pages.insertBlank(spec, destIndex?)` document operation
  and make `pages.insert` and `pages.extract` required across engine
  implementations. Add the blank-page input types, wire protocol, HTTP paths
  and schemas, conformance coverage, and `pages.inserted` event assertions.

## 3.0.0-next.8

### Minor Changes

- [#783](https://github.com/embedpdf/embed-pdf-viewer/pull/783) by [@bobsingor](https://github.com/bobsingor) – Add the `*.renderEncoded` wire kinds (`pages.renderEncoded`,
  `document.renderPageFileEncoded`, `annotations.renderAppearancesEncoded`)
  plus their `RenderEncode` / `EncodedImageWire` shapes — cloud-server
  surface (types only): the raster is encoded where it is produced and only
  the compressed image crosses the engine boundary.

  Make document access endpoints document-scoped by changing
  `wirePaths.access` to a `wirePaths.access(docId)` builder. Keep
  `wirePaths.accessLegacy` for transitional clients and allow the scoped
  endpoint to omit `docId` from the request body.

## 3.0.0-next.7

## 3.0.0-next.6

## 3.0.0-next.5

### Minor Changes

- [#759](https://github.com/embedpdf/embed-pdf-viewer/pull/759) by [@bobsingor](https://github.com/bobsingor) – Add an explicit character-to-text map to page text snapshots, with shared helpers for translating boundaries, converting text offsets to character ranges, slicing selected text, and validating the wire representation. Search hits are now defined in character space, and reusable conformance coverage verifies non-printing characters, supplementary-plane text, and exact search-to-selection round trips.

## 3.0.0-next.4

### Minor Changes

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Add the canonical affine-aware text layout engine under `text/layout`: `buildPageTextLayout`, `textGlyphAt`, `expandTextRangeToWord`/`Line`, `textGlyphQuad`, and `textSegmentsForRange`, producing `PdfTextSegment { quad, rect, advance }`.

  Orientation frames are derived from the semantic edges of glyph quads and keyed by baseline direction and ascent handedness. Rotated and mirrored text become upright inside their frame, while shear remains an in-frame variation so mixed roman and italic text stays in one segment. Every run in a cluster uses the same canonical frame, and upright documents retain a byte-identical fast path.

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Extend the caret annotation contract with box-family rotation metadata.

  Caret DTOs, drafts, patches, and schemas now carry optional `rotation` and `unrotatedRect` fields with the same tri-state semantics as other box-family annotations. Rotation-stripped appearance documentation now includes carets.

- [#749](https://github.com/embedpdf/embed-pdf-viewer/pull/749) by [@bobsingor](https://github.com/bobsingor) – Adds `share` to the `OpenInput` union and a `SharePasswordRequired` engine error code.
  - `OpenInputShare` (`{ kind: 'share', shareToken, sharePassword?, password? }`) is the third cloud reference form, alongside `id` and `token`: a public share token from the dashboard's embed snippet, resolved by the cloud engine itself. Rejected by `@embedpdf/engine`, like the other cloud kinds.
  - `sharePassword` is the grant's passphrase (checked at exchange); `password` stays the PDF's own encryption password, same slot as every other kind.
  - `EngineErrorCode.SharePasswordRequired` is the prompt-and-retry signal for protected grants — the share sibling of `DocPasswordRequired`.

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Extends page geometry snapshots with an upright/rotated run union, oriented glyph cells, rotation and ascent-flip metadata, uniform quad and bounds helpers, wire schemas, and orientation conformance coverage.

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

### Minor Changes

- [#720](https://github.com/embedpdf/embed-pdf-viewer/pull/720) by [@bobsingor](https://github.com/bobsingor) – Exports `wireTemplates`, the canonical Fastify-style path templates for backend-callable, unversioned document-plane routes. The templates let `@cloudpdf/contract` and server route-conformance checks share one source of truth without exposing the viewer-only immutable URL variants.

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the transport-independent Engine v3 contract. It includes engine and document interfaces, DTOs, wire schemas, error handling, abortable operations, and a conformance harness shared by local and cloud implementations.
