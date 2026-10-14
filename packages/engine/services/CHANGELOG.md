# @embedpdf/engine-services

## 3.0.0-next.15

### Minor Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The appearance batch renders every mode and state an annotation stores, each labelled, and reads each annotation's `appearanceState`. Page renders draw form fields with the annotations unless `includeFormFields` is `false`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A bundle's export and import pieces are shared by every family: the page table (`bundlePagesOf`), the resources kept once by hash (`BundleResources`), and the check of a received bundle (`checkWireBundle`, `assertImageWithinLimit`). The annotation exporter and importer use them; their bundles are unchanged.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Every write stamps its `meta` with the request's `opId` and whether it can be undone: `DocumentSession.beginTransaction(opId)` opens the write's transaction with its id, and `writeStamp()` and `markUndoable()` read and set what the meta reports. The page-space boundary converts `document.apply` requests and results.

  Add `ChangeApplier`, which runs a change's ops in one transaction, each checked against the change's `ChangeAuthority` as its single verb checks it, and records the steps that reverse them, from what it found and wrote: dictionaries captured before a write and put back exactly when nothing changed them since, with a fallback by value for annotation updates, field properties and form values; deletes captured and restored at the same numbers and positions; creates removed only when nobody changed or built on them. Add `ChangeLedger` (`changeLedgerOf(session)`), which keeps each change's answer under its `opId`, refusals included, and its record until a final change (redaction apply, flatten, signing, form repair) ends undo or the 64 MB capture budget runs out. The worker answers `document.apply`, and runs every undoable single verb as a one-op change, so its `opId` undoes it.

  The worker answers `document.applyChanges`: a server request's changes in one job, each in its own transaction, answered with its result and the record that undoes it, or its refusal; an undo of a change outside the request runs the record the server sends. Add `packChangeRecord` / `unpackChangeRecord`, a record as JSON beside one blob of its captures.

  Add `SessionEventPublisher.publishChange(opId, events, undoOf?)`, which publishes a change's events and, for an undo, the change it undid.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Form writes stamp field attribution in the field's `/EMBD_Metadata` (`features/forms/internal/fieldAttribution.ts`): `create` stamps the creator, a value write that changes the value and a script's value effect stamp the filler, a reset clears it. The stamp is written inside the change's capture, so undo puts the previous one back. The form read reports the six attribution members; widget rows report none.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A form write checks each field against the caller's groups.
  - **Filling in:** a value or displayed text, each field a reset puts back, and the undo of a fill, need the field's group. A field a script calculates, or a script's show or hide, is allowed when the same change fills one of the caller's own fields.
  - **Signing:** the signature look, `signatures.prepare` and `complete` need `sign` on the field's group.
  - **Groups:** creating or moving a field, and copying a form bundle in, need `set-group` for a group other than the caller's own. A restoring import keeps each field's group.
  - **Values import:** a values import leaves out the fields the caller may not fill in.
  - **Default lock:** signing a signature field in a group, without a `lock`, locks the group's other fields as they are at signing, but not its signature fields. A field's group is read from and written to its `/EMBD_Metadata /GroupID`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Field scripts and the calculation order are written: `writeActionTree` builds an action tree with the runtime's creators, `writeFieldScripts` sets a field's events (skipping one already as written), and the form mutator keeps `/AcroForm /CO` in step with the calculate scripts. `forms.reorderCalculations` moves fields by neighbour; a `calculations.restore` undo step takes back what a change did to the order, where nobody changed it since. An update's undo by value covers scripts. `createDestination` moved to the destinations feature.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `FormExporter` and `FormImporter`: the form bundle's export, and its design and values imports as change ops (`forms.import`, `forms.importValues`), each recording its undo. A design import's undo deletes each field it made, with its widgets and calculation-order slot; a values import's puts back each value and its filler. A restoring import's undo and redo take `doc.forms.import`. Worker kinds `forms.export`, `forms.import` and `forms.importValues` replace the FDF/XFDF ones; `sniffFormat`, `FormReader.exportData` and `FormMutator.importData` are gone. `doc.apply` refuses a form import op.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The form read builds every widget row from the pages (only widget rows: another annotation's subtype is read, never its row), and the annotation read builds no widget row. Appearance batches render one family. `forms.updateWidget` runs as a form op with its undo; annotation ops refuse widgets. Form results carry the rows of the widgets they changed.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The `forms.deleteWidget` op: the widget leaves its field (field and widget dictionaries captured around it) and its page (the widget captured there). Its undo step brings it back at its place and re-attaches it, unless its field changed since; the undo's undo deletes it again.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) –
  - Widgets read and write an underline border, a dashed border's dash, and a check box's or radio button's check style.
  - Form writes report the widgets whose pictures changed (`redrawnWidgets`).
  - `forms.setDisplay` and `forms.setAppearanceText` are change ops; the form-effects batch and its `forms.applyEffects` job are removed.
  - A reset of fields already at their defaults, or a display that changes no widget, writes nothing: it can't be undone.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) –
  - Form values, resets, options and defaults are worked out by engine-core's rules and written with the fork's plain writers. A value a field already holds writes nothing and can't be undone.
  - Pages read their tab order; list boxes their top row; widgets their font as a face, so a registered font reads back as its key.
  - A widget takes a registered font. A widget update that changes only its colour or size keeps its font and size, and a free text's border colour change keeps its font.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – An annotation import runs as a change (`ChangeApplier` op `annotations.import`): kept under its `opId` with the record that undoes it, a retry answers again, and `meta.undoable` is `true`. Its undo removes each imported thread whole, where nothing changed since; a restoring import's undo and redo take the import's rights (`doc.annotate.modify` and `doc.annotate.import`) instead of the per-annotation delete rules. A stamping import checks each annotation as its create would. `doc.apply` refuses an import op.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Resolve `PageRef` addresses at the worker boundary and emit the new page-identity record shapes: page state, revision tokens, annotation refs and DTOs, widget refs (`null` when unplaced), destinations, search matches, named-page targets, and the page fields of flatten, redaction, insert and scale results.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Push buttons are created (family code 1) and their widgets drawn by the runtime's push-button generator, with the caption written through `EPDFAnnot_SetMKText` and read back for push buttons only. A caption on another family's widget is refused; its `caption: null`, as its row reads, is dropped. A widget update draws the widget again only when the update's appearance decision says so, so a move, new actions or a row sent back keep the drawing a file has.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A reorder is one block move in a page's `/Annots`, planned against the page's stack: the rows land beside their own family's rows and the other family keeps its order. Each reorder's undo restores the old neighbours of the rows still where it left them. Page reorder and insert resolve a position to the index the engine moves to. Internal reads find an annotation's `/Annots` position from its ref, not from a row field.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `EventHub` and `SessionEventPublisher` moved to `@embedpdf/engine-core/runtime`: they run on the main thread beside a document handle, and this package is the engine host's.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A widget's actions are written: `writeWidgetActions` sets or removes each event's action through the runtime (`/A` for `activate`, the `/AA` entry for the others), from a widget's placement and from a widget update. On a field merged with its widget, the field's own scripts are left alone. The change ops check `doc.forms.script` for a script, submit or URI action, and an update's undo by value converts the read actions back to a write.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A widget's turn is read from and written to `/MK /R` (counterclockwise in the file, clockwise in the API), its box worked out from `/Rect`. A placement, by its `rect` or its `box`, is resolved once (`placedWidgetOf`), and its `rotation` is written before the field adopts the widget, so its appearance is drawn turned; a placement turn that isn't a quarter turn, or one with no place, is refused with `InvalidArg`. Box kinds' writers take the placed draft (`PlacedDraft`).

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Run every document write as one layer transaction. A write that fails leaves the document and its derived caches as they were; a commit that fails makes the session refuse later jobs with `DocNotOpen` until the document is opened again.

  Annotation updates, deletes and reorders find their annotations without loading the page, so none parses the page's content. A write that moves entries of a page's annotation list (a delete, a reorder, a flatten, a redaction, a merged form field's split) first turns the page's inline annotations into objects in place. Annotation updates and deletes check the caller's authority against what the write finds.

  Remove plain (non-layer) sessions and checkpoint rollback.

  `pages.insertBlank` inserts each page without loading it.

  Page flatten and redaction apply are all or nothing: a page that fails, or a cancel, rejects the call and leaves every page as it was, instead of keeping the pages before it.

  Name every annotation for life: by its object number, or, for an annotation the file stores inline, by the position it was born at, which it keeps after the layer gives it an object number. Pages inserted into a layer hold only objects. The engine no longer writes an `/NM` into an annotation it changes, and keeps no page revisions.

  Create objects at the object numbers a write names: annotations, blank pages, form fields, widgets and a merged field's split widget. A session that hands numbers out (`objectNumbers: 'session'`, the default) refuses a number it doesn't hold, spends the ones a write commits, and keeps them when it aborts; one the caller vouches for (`'caller'`) is created as asked. A write that would pass the highest object number a file should have is refused with `LayerFull`.

  Name every annotation a create makes without an `nm` with a fresh UUIDv7, widgets included, and give the copies of a stamping import fresh names. `SessionEventPublisher.publishWrite(opId, ...events)` replaces `publishLocal`: every event of a write carries its `opId` as `origin.tx`.

  A write request's `objectNumberFloor` raises the layer's last object number before the write, so what the write makes for itself is numbered from the floor. Opens, saved layer artifacts and a finalized signing candidate report the layer's last object number.

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Reads and writes use the `Annotation` type (was `AnnotationDTO`). An update that sends back the `file: null` a file attachment without an embedded file reads as changes nothing; removing an existing file is still refused.

- [#868](https://github.com/embedpdf/embed-pdf-viewer/pull/868) by [@bobsingor](https://github.com/bobsingor) – The write checks and import planners come from `@embedpdf/engine-core/validation`. Every annotation write is still checked against its kind's schema before its first native write, and a rect or box with `Infinity` or `NaN` in it is now refused with `InvalidArg` on `rect`, where it used to be written.

  An update writes what a viewer predicted for it: a field sent back as it reads is not a change and isn't written again, so nothing follows from it. A measured polygon that resends its vertices with a new color keeps its caption and label, where the label used to be worked out again; a changed value the kind can't write is still refused.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `forms.addWidget`'s answer lists every widget new to the field: for a merged field, the widget half it split off at its new number too, so a reader's rows follow where it went.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Widget records are built through `formWidget` everywhere the engine reads or echoes them, so `ref` is always present; attach and detach resolve the widget from its annotation address.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – An attachment's bytes are found by the key its `resources.file` names.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A page picture draws form fields without the other annotations when asked: the widget pass no longer depends on drawing annotations.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A page whose parsed content is bigger than the whole parsed-page budget now
  stays parsed between the jobs that use it, so the tiles, reads and re-renders of
  a heavy drawing share one parse instead of parsing the page again for each job.
  Pages that fit stay beside it within the budget, and it closes when the pages
  jobs hold need that room.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Annotation changes check each annotation they touch: a widget takes `doc.forms.modify` and never the annotation permissions. This covers creates, updates, deletes, moves and their undo. A move carries the caller's authority into the worker, as updates and deletes do.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Renders pages in slices of 8 ms (`renderSliceMs`), letting the worker receive messages between them, so aborting a render stops it at the next slice instead of after the whole page. Requests that arrive during a render wait their turn in arrival order, and an aborted request that is still waiting is answered at once without running.

  The malformed-page error names the page's object number as `details.pageObjectNumber`.

  Keeps up to 128 MB of decoded images between read-only jobs (`decodedImageBudgetBytes` on the worker host), so tiles of image-heavy pages no longer decode the same images again. Any other job empties the store before it runs, and output stays byte-identical. On a plan drawn as one 35-megapixel JPEG, ten zoomed tiles take 21 ms instead of 490 ms.

  Keeps a page loaded between read-only jobs (renders, appearance renders, text, geometry, search) instead of parsing it again for every job, so the tiles of a page with millions of objects no longer each pay for a full parse. Output stays byte-identical to loading the page again: kept pages drop their decoded images between jobs, every other job closes kept pages before it runs, and at most one page with many objects is kept per runtime.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `doc.redaction.apply({ annotations })` applies a page's marks in one pass: their regions are redacted together, so an image under several marks is read and written once, and the page's other redaction marks stay.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A widget update that changes only its border style keeps the border's width, and one that changes only the width keeps the style. Before, a new style reset the width to 1, and a new width made a dashed border solid.

## 3.0.0-next.14

### Minor Changes

- [#827](https://github.com/embedpdf/embed-pdf-viewer/pull/827) by [@bobsingor](https://github.com/bobsingor) – Read and write PDF measurement dictionaries and viewports, derive labels on geometry or scale edits, and preserve imported labels on style edits. Move manual shape captions with rigid geometry transforms and validate measurement input before native writes.

  Avoid an additional full-document buffer copy when exporting a saved PDF.

- [#800](https://github.com/embedpdf/embed-pdf-viewer/pull/800) by [@LazyCompiler](https://github.com/LazyCompiler) – Local engines honour the `ignoreWhitespace` search flag: a query carrying it re-folds the cached page text with whitespace dropped, so `invoice` finds a letter-spaced `i n v o i c e`, and search cursors key on the flag so a resumed search never mixes hits from the two folds. Combining the flag with `regex` is rejected with `InvalidArg`.

## 3.0.0-next.13

### Minor Changes

- [#817](https://github.com/embedpdf/embed-pdf-viewer/pull/817) by [@bobsingor](https://github.com/bobsingor) – Read and write FreeText rich-text documents through the shared annotation services, preserve registered font keys on readback, and reject mismatched plain and rich text before applying a mutation. Default-style changes preserve explicit run overrides, while plain-text replacement resets run formatting.

  Carry font identity, editing authorization, and document font settings through the worker protocol.

- [#812](https://github.com/embedpdf/embed-pdf-viewer/pull/812) by [@bobsingor](https://github.com/bobsingor) – Add signature readers, revision and working-copy analysis, two-phase signing, and session-independent candidate finalization. Support signature-field creation and visual appearances, enforce declared document and field restrictions, and install completed signatures as new immutable bases.

  Preserve loaded bytes for unchanged or reverted edits. Use file-backed candidates, layer artifacts, overlays, and streamed downloads for native file sessions to reduce memory use, while retaining buffer-based support for WASM sessions.

## 3.0.0-next.12

### Minor Changes

- [#803](https://github.com/embedpdf/embed-pdf-viewer/pull/803) by [@bobsingor](https://github.com/bobsingor) – New `annotations.flatten` and `annotations.exportAppearance` worker jobs over the runtime's set-based flatten: resolve refs on the page, hand the set to one candidate plan, and either paint in place (bumping that page's revision and weak-annotation state like a page flatten) or into a scratch document returned as PDF bytes.

  Every page list now includes the catalog's named-page registrations (`namedPages`), read from the runtime with each value classified as page, template, or dangling. New `pages.setName` and `pages.removeName` worker jobs register, rename, or remove `/Names /Pages` entries and return the fresh layout; page deletion drops the registrations that pointed at the page.

  Annotation `/Name` is written and read as text: note and file-attachment icons map their ids to PDF names, stamps accept any non-empty name (standard or custom) and report custom names verbatim instead of collapsing them, and a stamp patch with `name: null` removes the entry without touching the appearance.

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – The action model reader extracts the SubmitForm payload atomically (feature-detecting the Phase-4 runtime getters: an older runtime payload yields the bare recognized-inert node — the pin-lag skew case, unit-pinned; a NEW runtime withholding an unresolvable `/F` degrades the whole node to `unknown` + `payload-dropped`). `/Fields` targets and the URL/CharSet strings charge the existing aggregate budgets.

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – The action-model walker now materialises interpreter payloads (destinations, URIs + `/IsMap`, named-action names, Hide targets + `/H`, ResetForm three-state fields + exclude, file specs) with reserve-before-allocate budgeting — payload lengths are charged against the aggregate read budget before any scratch buffer is allocated, and name-tree script names ride the same budget. `readActionModel` and the annotation/form field readers take the owning document pointer; `readDestination` moved to a shared `features/destinations/` home. The link target is now a pure projection of the payload-carrying activate tree (`linkTargetFromActionTree`) — the duplicate native root-read is gone, an `incomplete` tree projects `unsupported`, and a malformed `/A` no longer silently falls back to `/Dest`.

## 3.0.0-next.10

### Minor Changes

- [#788](https://github.com/embedpdf/embed-pdf-viewer/pull/788) by [@bobsingor](https://github.com/bobsingor) – Read and write annotation subjects and text review states, preserve current
  annotation state during sparse writes, and use `EPDFAnnot_SetRect` for moves
  that must not regenerate appearances. Event delivery now reports gaps that
  require a full client refresh.

## 3.0.0-next.9

### Minor Changes

- [#772](https://github.com/embedpdf/embed-pdf-viewer/pull/772) by [@bobsingor](https://github.com/bobsingor) – Implement blank-page insertion with PDFium and dispatch the new
  `pages.insertBlank` worker request. The implementation validates page size,
  count, and destination index, creates persistent blank pages, and returns
  their new page object numbers and layout.

## 3.0.0-next.8

### Minor Changes

- [#783](https://github.com/embedpdf/embed-pdf-viewer/pull/783) by [@bobsingor](https://github.com/bobsingor) – `WorkerHost` accepts an optional injected `WorkerImageEncoder` (third
  constructor argument) and dispatches the new `*.renderEncoded` kinds
  through it on a narrowly-scoped async path. No new dependencies: the
  native encoder stays in the injecting package. Hosts without an encoder
  (browser/local workers) reject those kinds with `NotImplemented`;
  existing two-argument construction is unchanged.

## 3.0.0-next.7

## 3.0.0-next.6

### Patch Changes

- [#768](https://github.com/embedpdf/embed-pdf-viewer/pull/768) by [@bobsingor](https://github.com/bobsingor) – Bound individual annotation-appearance raster allocations at deep zoom by reducing the effective appearance scale while preserving the original placement rectangle. Oversized page-spanning appearances now degrade softly instead of exhausting the wasm heap with multi-gigabyte bitmap requests.

## 3.0.0-next.5

### Minor Changes

- [#759](https://github.com/embedpdf/embed-pdf-viewer/pull/759) by [@bobsingor](https://github.com/bobsingor) – Build validated full-fidelity page text snapshots from the runtime's text and character-map calls. Search now converts matched string offsets back into character-space ranges before producing hit geometry, so search, selection, and copied text remain aligned when extracted text diverges from PDF character slots.

## 3.0.0-next.4

### Minor Changes

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Replace the parallel `rects[]` and `quads[]` geometry on `SearchMatch` with canonical `segments: PdfTextSegment[]`, validated by `PdfTextSegmentSchema`.

  Search tokens now always encode `format=segments1`, preventing newer clients from consuming stale CDN-cached responses with the old geometry shape; old tokens fail decoding instead.

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Persist and render caret rotation through the engine annotation services.
  - Read and write the caret `rotation` and `unrotatedRect` metadata pair during create, patch, and list operations.
  - Treat caret subtype 14 as box-family when rendering annotation appearances, returning a rotation-stripped raster placed by the logical box so consumers do not double-rotate it after reload.

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Reads boxes, oriented cells, flags, and text orientation through the new runtime geometry call, preserving the compact upright wire shape while emitting rotated runs for non-upright glyphs. Native page-redaction failures are now reported instead of being mistaken for pages without redaction annotations.

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the runtime-independent Engine v3 service implementations. The same document, page, annotation, form, search, and mutation logic runs over both the local WASM runtime and CloudPDF's native worker runtime.
