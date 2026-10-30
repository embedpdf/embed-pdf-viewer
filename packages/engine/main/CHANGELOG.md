# @embedpdf/engine

## 3.0.0-next.19

## 3.0.0-next.18

## 3.0.0-next.17

## 3.0.0-next.16

### Minor Changes

- [#891](https://github.com/embedpdf/embed-pdf-viewer/pull/891) by [@bobsingor](https://github.com/bobsingor) – On the local engine, `doc.attachments.create()` and `delete()` are changes that can be undone, and a download of a file (an attachment, or an annotation's `file`) that decodes to more than 256 MB is refused with `PayloadTooLarge`, so a small compressed file can't take the tab down.

- [#885](https://github.com/embedpdf/embed-pdf-viewer/pull/885) by [@bobsingor](https://github.com/bobsingor) – `doc.outline` on the local engine: read the document's outline and create, update, move and delete its items as undoable changes.

- [#890](https://github.com/embedpdf/embed-pdf-viewer/pull/890) by [@bobsingor](https://github.com/bobsingor) – On the local engine, `doc.pages.rotate()`, `reorder()`, `delete()`, `insert()` and `insertBlank()` are changes that can be undone.

- [#883](https://github.com/embedpdf/embed-pdf-viewer/pull/883) by [@bobsingor](https://github.com/bobsingor) – The local engine's `pages.extract(pages, options)` makes flattened copies: `{ flatten: { usage: 'print' } }` returns the pages as they print, painted in, with nothing interactive left. It needs `doc.download` or `doc.download.flattened`, and paints only what the caller may read.

- [#883](https://github.com/embedpdf/embed-pdf-viewer/pull/883) by [@bobsingor](https://github.com/bobsingor) – `page.render.image()` and `render.raw()` make print pictures (`usage: 'print'`, `viewport: { kind: 'dpi', dpi: 150 | 300 }`): drawn by the print rules, sized for the paper, refused without `doc.print` (or `doc.print.high` at 300 DPI). Print pictures are off the render lattice, so an enforced lattice doesn't refuse them.

### Patch Changes

- [#878](https://github.com/embedpdf/embed-pdf-viewer/pull/878) by [@bobsingor](https://github.com/bobsingor) – The local engine no longer stalls when a call that every job waits for, such as `engine.fonts.register()`, is queued while a page read runs: a running read now gives way only to work that is more urgent than what waits behind it, so every queued call still gets its answer.

- [#884](https://github.com/embedpdf/embed-pdf-viewer/pull/884) by [@bobsingor](https://github.com/bobsingor) – The engine's workers now start under `next dev` when Next.js compiles them, as it does for a package in `transpilePackages` or a linked copy outside `node_modules`. React Fast Refresh used to add `$RefreshReg$` calls to `workers/embedpdf-worker.js`, which don't exist in a worker, so the viewer reported that the engine worker did not start. The worker is now a self-contained IIFE that Fast Refresh leaves alone, and the build checks that it stays that way. The image encoder worker now starts as a module worker, like the engine worker: Next.js appends `import.meta` code to it, which a classic worker can't parse, so encoding fell back to the main thread with a warning.

## 3.0.0-next.15

### Minor Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `renderAppearances()` returns every look an annotation has, each image labelled with its `mode` and `state`, and page renders show form fields with the annotations unless `includeFormFields` is `false`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Aborting a page render now stops it in the worker, usually within a few milliseconds, instead of letting it finish first, so the renders queued behind it, such as the tiles of a page the user scrolled to, start right away.

  The local engine implements the revised document API for page-space geometry, object-number page references, annotation creation and transfer, form fields, signatures, metadata, and render targets. Annotation writes return the engine's confirmed record and drawing geometry.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Add `doc.apply(change, options)` to the local engine: one change as one worker job, its events published once the worker confirms, all sharing the change's `opId`. Every write request carries its `opId` to the worker.

  `doc.apply({ undoOf: opId })` undoes a change, and the undo of an undo redoes it; every single verb's `opId` can be undone the same way. A retry under the same `opId` answers what the first call answered and publishes nothing again.

  An undo's events carry `origin.undoOf`, the change it undid.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – A document opened without a `scope` allows what the file allows, as in Acrobat: everything for an unprotected PDF, and a protected PDF keeps its own restrictions (no printing, no copying…) until its owner password lifts them. The default is `pdf.permissions` plus what no PDF flag governs: `doc.download`, `doc.download.flattened`, `doc.annotate.import`, `doc.forms.import`, `doc.forms.script`, `doc.forms.submit`, `doc.sign.certify`, and putting annotations and fields in any group. It was `['*']`, which ignored the file's restrictions, with a console warning, now gone. `scope: ['*']` still allows everything.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Form writes act for the handle's identity: a created field names its creator, and a fill its filler (`createdBy`, `filledBy`, `filledByName`, …).

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Field groups on the local engine:
  - The form and signing verbs send the handle's grants with the write, which checks each field. Filling in and signing need `doc.forms.fill` / `doc.sign` or a `fields:` scope for some group.
  - `doc.security.allowsField(...)` answers per field.
  - `open()` no longer asks for `identity.groups` with a `:group=` scope.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `doc.forms.reorderCalculations()`; `create()` and `update()` write field scripts, refused without `doc.forms.script`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `doc.forms.export(selection)`, `doc.forms.import(bundle, options)` and `doc.forms.importValues(bundle, options)` replace the FDF/XFDF `export(format)` and `import(bytes)`, with the permission checks of each (`doc.forms.import` to restore attribution; without `doc.forms.script`, scripts, submits and links are left out). An import fires one `forms.created` or `forms.valueSet` per field. `FormTransfer` stores a bundle as one JSON file.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `doc.forms.updateWidget()`, `page.forms.renderAppearances()` and `renderAppearancesRaw()` on the local engine.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `doc.forms.deleteWidget()` on the local engine, publishing `forms.widgetDeleted`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) –
  - `doc.security.fieldRights()`: the groups the handle may fill in, sign and assign.
  - `doc.forms.applyEffects` is removed: write a script run's effects as one change with `doc.apply`.
  - A reset of fields already at their defaults, or hiding a field that's already hidden, can't be undone: nothing was written.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) –
  - `PageLayout.tabOrder` and a list box's `topIndex`.
  - A widget's `fontFamily` can be a registered font's key, and reads back as one. Changing a widget's colour or size keeps its font; changing a free text's border colour keeps its font.
  - Setting a field to the value it holds writes nothing and can't be undone.
  - A checkbox's or radio group's value is written as the checked widget's on-state name.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Page handles, page services and weak-edit sessions take and expose `PageRef` addresses; local document events carry `page`/`pages` refs instead of bare page object numbers.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `doc.forms.create()` makes push buttons, each widget with its `caption`; `updateWidget()` changes the caption. Moving a widget or changing its actions keeps its appearance.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `doc.pages.reorder()`, `page.annotations.reorder()` and `doc.forms.reorderWidgets()` on the local engine, publishing `pages.reordered`, `annotations.reordered` and `forms.widgetsReordered`; `pages.insert()` and `pages.insertBlank()` take a position (default `'end'`).

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The local engine says `canOpenFiles: true`: it opens a file's own bytes, wherever they come from.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The engine's workers start from files of your build by default: `localEngine()` points your bundler at `workers/embedpdf-worker.js` and `workers/encoder-worker.js`, which webpack 5, Vite, Rspack, Parcel and Turbopack emit beside your code, so `worker-src 'self'` covers them and no `blob:` URL is needed. Next.js, which gives the files URLs relative to the page, gets them the same way. Where the engine's scripts are on another origin than the page (loaded from a CDN), the workers start from `blob:` URLs, since a browser starts a worker only from the page's own origin. `worker: 'inline'` and `encoderWorker: 'inline'` still ask for the `blob:` delivery; `@embedpdf/engine/portable` uses it, as its toolchains cannot emit the files.

  Every worker URL goes through one Trusted Types policy named `embedpdf`, which passes only the engine's own worker files, the `blob:` URLs it makes and the `worker` / `encoderWorker` URLs you configure, so a page with `require-trusted-types-for 'script'` adds only `embedpdf` to the policies its bundler needs. Two copies of the engine on one page share the policy.

  The worker files are exported as `@embedpdf/engine/workers/embedpdf-worker.js` and `@embedpdf/engine/workers/encoder-worker.js`, and `embedpdf-worker.js` no longer contains `import.meta`, so it runs as a module or a classic script alike. `resolveInlineWasmSource` is renamed `resolveDefaultWasmSource`.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Where the engine runs in its worker, the page's main thread no longer downloads the engine host and PDFium's runtime: they load, as a chunk of their own, only when an engine boots in the page itself (no `Worker`, as in Node, or `createLocalEngine()`). The same engine, the same fallback and the same errors; in a minimal Vite app with the viewer, the main thread's first download of JavaScript is a third smaller (a fifth gzipped). `InlineTransport` is no longer exported: `createLocalEngine()` runs PDFium in the current thread.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `doc.forms.updateWidget()`, and the widget placements of `create()` and `addWidget()`, write a widget's actions; a script, submit or URI action is refused without `doc.forms.script`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Make every document write all-or-nothing: a write that fails changes nothing.

  Annotation updates and deletes no longer read the page before they write: the engine checks the caller's authority against the annotation, and against everything a delete takes with it, inside the write. A refusal names the annotations it refused.

  Remove the `sessionKind` open option: every document opens as an immutable base with an editable layer.

  `doc.pages.flatten()` and `doc.redaction.apply()` are all or nothing: when a page fails, or the call is cancelled, no page changes and the promise rejects with the error. Their results no longer have `'failed'` or `'skipped'` pages.

  An annotation's ref no longer changes: an annotation the file stores inline is named `{ kind: 'baseIndex', page, baseIndex }` by the position it was born at, through every write, and every other annotation by its object number. The `index` and `nm` ref kinds, `identityQuality`, page revisions, `shouldRefetch`, weak edit sessions (`doc.annotations.beginEdit`) and the `InvalidReference` and `WeakAnnotationSessionConflict` errors are gone. `meta.changed` and the `annotations.deleted` event's `deleted` list `AnnotationRef`s.

  Every write takes its options last, with an `opId` that names the write; each event it fires carries it as `origin.tx`. A create's bytes go in the options: `page.annotations.create(data, { resources })` and `update(ref, patch, { resources })`.

  Name a new annotation, page, field or widget before it exists: take a number from `doc.objectNumbers` and pass it as the create's `objectNumber` (`objectNumbers` for `pages.insertBlank`, `widgetObjectNumbers` and `splitObjectNumber` for forms). The ref is final at once. The pool holds 64 numbers from the moment the document opens and refills in the background; a number the session doesn't hold is refused with `ObjectNumberUnavailable`.

  Writes apply in the order they are made, a create with bytes to read included: an update made right after a create runs after it.

  Every annotation the engine creates without an `nm` gets a fresh UUIDv7 name, widgets included; a copy made by an import with `attribution: 'stamp'` gets a new one, so pasting onto the same page no longer drops a named annotation.

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The local engine's annotation reads are typed `Annotation` (was `AnnotationDTO`).

- [#868](https://github.com/embedpdf/embed-pdf-viewer/pull/868) by [@bobsingor](https://github.com/bobsingor) – zod never reaches the page or an app's bundler. The engine's client imports only engine-core's zod-free entries, and the schemas run where the engine does. An engine with no `Worker` (a browser without one, or `createLocalEngine()` in a page) now loads one self-contained file the package ships, `workers/inline-transport.js` (1043 KB, 203 KB gzipped): the engine host, PDFium's runtime, the schemas and the one copy of zod, with nothing left for a bundler to resolve, so Parcel 2 builds and runs the viewer with its defaults. A page with a worker never fetches it. In Node the engine imports the host and runtime as packages, whatever conditions the resolver asks for: a test run that asks for `browser` (as a Svelte app's does) still boots the Node build, and so does a DOM environment that asks for `browser` alone. That fallback now takes the wasm location the engine resolves for its worker, so `wasmUrl`, `assetsUrl`, `wasmBinary` and the portable entry's inline wasm apply to it too.

  The worker refuses an annotation create or update whose rect has `Infinity` or `NaN` in it, with `InvalidArg` on `rect`.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – `forms.attachWidget` and `forms.detachWidget` take the widget's annotation address (`AnnotationRef`) and resolve the widget from it.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `doc.annotations.import` can be undone and redone with `doc.apply({ undoOf })`, and a retry under the same `opId` answers again without writing.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – An attachment's bytes travel under the key its `resources.file` names.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Page renders draw the annotations and form fields the caller may read, and refuse asking for more. Moving annotations checks each one inside the write, so moving a widget takes `doc.forms.modify`. `security.allowsAnnotation` treats widgets as form design.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Every open document has its own `origin.sessionId`, as on the cloud engine.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Widgets turn by `rotation` (quarter turns, clockwise), and a box kind can be created by its `rect` with a quarter turn.

## 3.0.0-next.14

### Minor Changes

- [#827](https://github.com/embedpdf/embed-pdf-viewer/pull/827) by [@bobsingor](https://github.com/bobsingor) – Support distance, perimeter, and area measurements through the local engine. Add page measurement viewport reads and calibration writes, with persistence in saved PDFs and layers and viewport change events.

## 3.0.0-next.13

### Minor Changes

- [#817](https://github.com/embedpdf/embed-pdf-viewer/pull/817) by [@bobsingor](https://github.com/bobsingor) – Support reading and authoring rich-text FreeText annotations through the local engine. Expose document-level font embedding and typographic settings through `doc.fonts`.

  Return resolved font identities and embedding permissions from registration, and add `engine.fonts.authorizeEditing()` for applications authorized to edit with preview-and-print fonts.

- [#812](https://github.com/embedpdf/embed-pdf-viewer/pull/812) by [@bobsingor](https://github.com/bobsingor) – Add `doc.signatures` for signature inspection, revision analysis, and two-phase signing with externally supplied CMS data. Support signature-field creation and visual appearances, expose the saved document version, and update the same document handle after signing.

  Open documents as immutable bases with editable layers by default, with `sessionKind: 'plain'` available for unsigned documents. Preserve the loaded bytes on unchanged incremental downloads and add Node file-backed layer opens and `downloadToFile()`.

  Enforce declared signature restrictions by default, distinguish them from modification verdicts, and expose `signedDocumentPolicy` for applications that need to permit invalidating edits.

## 3.0.0-next.12

### Minor Changes

- [#803](https://github.com/embedpdf/embed-pdf-viewer/pull/803) by [@bobsingor](https://github.com/bobsingor) – The local engine implements `page(pon).annotations.flatten` (gated like `pages.flatten`, publishes `annotations.flattened`) and `page(pon).annotations.exportAppearance` (gated by `doc.download` like `pages.extract`).

  It also implements `pages.setName` and `pages.removeName`: register, rename, or remove a `/Names /Pages` entry as a page-structure mutation gated by `doc.pages.assemble`, with the fresh layout returned and a `pages.named` event published. `pages.list()` includes `namedPages`.

  The local engine never contacts a CDN. The zero-config default is the `embedpdf.wasm` your bundler emits beside your code (`@embedpdf/engine-runtime-wasm32/wasm-url`, which webpack, Vite, Rspack, Parcel, and Turbopack all resolve), and it is now streamed and compiled by the worker as it downloads — the previous fetch-then-fallback path had given up streaming. When a toolchain cannot carry that asset (Angular's application builder, plain esbuild), boot fails with the fix named instead of silently fetching a possibly mismatched binary from jsDelivr: `DEFAULT_WASM_URL` and the fetch-failure fallback are gone.

  New `@embedpdf/engine/portable`: the same `localEngine()` with the wasm delivered through the module graph — a lazy chunk of your own build, gzipped and inflated in the browser — so it works with every bundler at the same cost over the wire, with no asset to copy. `wasmLoader` joins `wasmUrl`, `assetsUrl`, and `wasmBinary` as an explicit source (bytes produced on demand at boot). Explicit sources never fall back.

  Angular needs neither: the package's export map routes the `es2020` condition Angular's application builder resolves with to the portable build, so the plain `@embedpdf/engine` import is zero-config under Angular too. Other bundlers do not declare that condition and keep the streamed asset.

## 3.0.0-next.11

## 3.0.0-next.10

### Minor Changes

- [#788](https://github.com/embedpdf/embed-pdf-viewer/pull/788) by [@bobsingor](https://github.com/bobsingor) – Implement local per-record collaboration permission checks for annotation
  creation, mutation, and group assignment. Update scope guards and the local
  runtime integration to support the new annotation and security contracts.

## 3.0.0-next.9

### Minor Changes

- [#772](https://github.com/embedpdf/embed-pdf-viewer/pull/772) by [@bobsingor](https://github.com/bobsingor) – Implement `pages.insertBlank` in the local document pages service. Blank-page
  requests use the worker protocol, enforce the page-assembly capability, and
  publish the resulting `pages.inserted` document event.

## 3.0.0-next.8

## 3.0.0-next.7

### Patch Changes

- [#775](https://github.com/embedpdf/embed-pdf-viewer/pull/775) by [@bobsingor](https://github.com/bobsingor) – Update the generated default WASM URL to use the current engine runtime release instead of the previous prerelease.

## 3.0.0-next.6

### Patch Changes

- [#768](https://github.com/embedpdf/embed-pdf-viewer/pull/768) by [@bobsingor](https://github.com/bobsingor) – Fix the default inline image-encoder worker path so it creates the bundled blob worker instead of attempting to fetch `/inline` and silently falling back to main-thread encoding. Tile rendering now keeps encoding work off the main thread under the default configuration.

## 3.0.0-next.5

### Minor Changes

- [#759](https://github.com/embedpdf/embed-pdf-viewer/pull/759) by [@bobsingor](https://github.com/bobsingor) – Return full-fidelity page text snapshots and character-space search ranges from the local engine. Non-printing and supplementary-plane text now round-trip consistently through extraction, search geometry, selection ranges, and text slicing.

## 3.0.0-next.4

### Minor Changes

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Returns orientation-aware page text geometry from the local engine so consumers can select and annotate rotated, sheared, and mirrored text without collapsing glyph cells into axis-aligned boxes.

### Patch Changes

- [#751](https://github.com/embedpdf/embed-pdf-viewer/pull/751) by [@bobsingor](https://github.com/bobsingor) – Export the shared document types (`OpenInput`, `OpenOptions`, `DocumentHandle`, `PageHandle`, `DocumentCapabilities`, `TokenSource`, …) from the package root, mirroring `@cloudpdf/engine`, so code driving the engine directly can name them without importing from the transitive `@embedpdf/engine-core` dependency.

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the rebuilt local Engine v3 implementation. It runs the EmbedPDF Runtime in a Web Worker for browsers or inline for Node.js and exposes the same abortable document interface as the CloudPDF engine.
