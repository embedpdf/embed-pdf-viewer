# @embedpdf/core

## 3.0.0-next.20

## 3.0.0-next.19

### Minor Changes

- [#918](https://github.com/embedpdf/embed-pdf-viewer/pull/918) by [@bobsingor](https://github.com/bobsingor) – A document opened with a grant reports what it waits for as `grantRequest`, and
  `retry()` takes the grant's `passphrase`.

- [#923](https://github.com/embedpdf/embed-pdf-viewer/pull/923) by [@bobsingor](https://github.com/bobsingor) – `createKernel({ fetch })` takes your own `fetch` for `{ kind: 'url' }` documents, to add headers or cookies; it gets the URL and an `init` with the document's cancel signal, and `retry()` calls it again. A `{ kind: 'url' }` source takes an `id` of its own. A download the server refuses with 401 or 403 fails as `permission-denied`, and one that isn't a PDF (a sign-in page, say) as `invalid-input`. New exports: the `HostFetch` type and `isPdf(bytes)`.

## 3.0.0-next.18

### Minor Changes

- [#907](https://github.com/embedpdf/embed-pdf-viewer/pull/907) by [@bobsingor](https://github.com/bobsingor) – A ready document whose share link asks for a passphrase or answers it got after the document opened shows them as `shareRequest`, as a document waiting to open does, and `documents.retry(id, { sharePassword })` or `retry(id, { visitor })` lets it go on as the same visitor instead of opening it again.

### Patch Changes

- [#909](https://github.com/embedpdf/embed-pdf-viewer/pull/909) by [@bobsingor](https://github.com/bobsingor) – `documents.retry(id, { identity })` takes the visitor's answers to what a share link asks (was `{ visitor }`). They join who the page said the user is, the document's `identity` or else the viewer's, and the document opens again with that identity.

- [#910](https://github.com/embedpdf/embed-pdf-viewer/pull/910) by [@bobsingor](https://github.com/bobsingor) – The `StaleBase` engine error is gone, and with it its `conflict` mapping: a signature moves only its own layer, so every layer can sign.

## 3.0.0-next.17

### Minor Changes

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – Documents from share links that wait for something. A failed open says what its share link waits for in `DocumentInfo.shareRequest` (the passphrase, with whether one was tried, or the visitor's answers), and `documents.retry(id, { sharePassword })` or `retry(id, { visitor })` opens it with them; answers add to the ones given before. Once open, a change waiting for the visitor's answers shows as `DocumentInfo.identityRequest` until `documents.identify(id, answers)` sends it or `documents.declineIdentity(id)` lets it fail.

### Patch Changes

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – A `LayerDeleted` refusal from the engine reaches plugins as `not-found`.

## 3.0.0-next.16

### Minor Changes

- [#891](https://github.com/embedpdf/embed-pdf-viewer/pull/891) by [@bobsingor](https://github.com/bobsingor) – `@embedpdf/core/testing` gains `gate(engine)`, an engine whose documents hold every change until a test releases or refuses it, so a plugin's tests can see what the reads show while a change is on its way. A predicted `attachments.restore` op lets a view draw an undone attachment removal before the engine answers.

- [#885](https://github.com/embedpdf/embed-pdf-viewer/pull/885) by [@bobsingor](https://github.com/bobsingor) – `PredictedOp` gains `outline.restore`: the items as they were, at their place, which is how an undo of an outline change is drawn before the engine answers.

- [#883](https://github.com/embedpdf/embed-pdf-viewer/pull/883) by [@bobsingor](https://github.com/bobsingor) – The documents capability prints. `print(id?, { pages, includeAnnotations, onProgress })` makes the pages as they print (layers, annotations and form fields by their print settings) and hands them to the host's print dialog. `preparePrint(id?, options)` does that ahead and resolves `{ quality, pageCount, needsTap, print(), dispose() }`, so a dialog prepares when the user presses Print and then prints; its `print()` prepares again when the document changed since. `needsTap` is the printer's: `true` where printing works only from a tap (Safari), so a dialog asks for another tap once the print is ready. `getPrintQuality(id?)` says how it prints: `{ kind: 'pdf' }` — a copy of the pages as they print (`pages.extract` with `flatten: { usage: 'print' }`), sharp text and lines — with `doc.print.high`, a right to keep the copy (`doc.download` or `doc.download.flattened`) and a printer that prints PDFs; else pictures, `{ kind: 'images', dpi: 300 }` with `doc.print.high` or 150 DPI with `doc.print` only; `null` when it can't. When the printer turns the PDF down, preparing or printing, the same pages print as 300 DPI pictures. Form fields print whenever the user may read the form, with or without the annotations. Printing waits for changes still on their way, as a download does. The host hands the kernel its printer, `createKernel({ printer })` (`HostPrinter`, with `stagePdf` when it prints PDFs and `needsTap` when it prints only from a tap), and `canPrint()` is `doc.print` and a printer. A plugin runs the document's own around the print dialog with `ctx.aroundPrint(wrap)`; the test context's `print(run)` runs those wraps.

### Patch Changes

- [#890](https://github.com/embedpdf/embed-pdf-viewer/pull/890) by [@bobsingor](https://github.com/bobsingor) – The page list follows `pages.restored`: pages an undo brings back show again.

## 3.0.0-next.15

### Minor Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Remove the `refFromStableId` re-export and the `InvalidReference` and `WeakAnnotationSessionConflict` error mappings: an annotation's ref is its name for life.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – One change per user action, shown at once:
  - **`ctx.changes`**, the document's change queue, shared by its plugins. `stage({ label, ops, undo? })` stages one change (the engine's ops) and sends it with `doc.apply` after everything staged before it; it returns the pending change, with its `opId` and the engine's answer (`result`). `hold(label)` gives a change that can be amended until it is sent (`open` says whether it still can, and `change` is the change it is once it has ops), `group(label, run)` makes everything staged inside `run` one change, `takeObjectNumber()` and `reserveObjectNumbers()` name new objects before the engine answers, and `pending()`, `hasPending()`, `whenSettled()`, `onStaged` and `onSettled` follow the queue. A refused create takes the changes that refer to what it would have created with it (`conflict`, `details.reason: 'dependency-refused'`). A download sends every open hold and waits for every answer first.
  - **Mirrors predict:** a mirror's or page mirror's spec takes `predict(value, op)`, and `view()` / `view(page)` show the confirmed value with this session's pending changes on top. A change leaves a view once that mirror holds its answer: when it folded the change's last event, even before the answer arrives, or after a read it asked for.
  - **One store update per change:** the events of one change land at once, whoever made it.
  - **What history reads:** a pending change says which change it undoes (`undoOf`, `null` for a change of ops) and its `merge` key: `hold(label, { merge })` makes consecutive holds with the same key one step of the history (the pauses of one typing session). `sendHolds()` sends every open hold now, as an undo does first.
  - The test context (`@embedpdf/core/testing`) has the same queue, sending through the test document's `apply`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A plugin has one context and one way to hold each kind of state.
  - `PluginDef` is `{ id, token?, scope?, requires?, optional?, state?, create }`; `create(ctx)` returns `{ api, connect? }`. The `initialState`, `reduce`, `capability`, `init` and `effects` fields are removed, and so are `Action`, `dispatch`, `getState`, `onAction`, `EffectContext` and the `CORE_*` action constants. `definePlugin<State, Capability>` takes two type parameters.
  - `ControllerContext` is merged into `PluginContext`: `ctx.state` (`get`, `update(transition, ...args)`, `onChange`) replaces `getState`/`dispatch`, `ctx.notify()` wakes readers of a resource, `ctx.watch(select, handler)` reacts to state the plugin does not own, and `ctx.core()`/the raw `ctx.subscribe` are gone (read the registry through `DocumentsToken`).
  - New `ctx.mirror(spec)` and `ctx.pageMirror(spec)` keep a local copy of engine data current from confirmed document events of every origin, with loads, replay past a cursor, resyncs on `stream.desynced` and `document.versioned`, statuses and `settled()`; `reload()` / `reload({ pages })` let a fold ask for a re-read. A failed load or page re-read reports `error` (the value is stale) until a full load succeeds.
  - New `memo` and `memoByKey` for identity-stable reads, and `createHostToken` for a plugin's host lens.
  - `resolvesAnyCapability: true` lets a plugin that runs host-supplied code (the commands plugin) resolve undeclared tokens without the development-mode dependency error.
  - `ChangeOrigin` is `{ locality, sessionId, actorId }`; `trigger` is removed.
  - `@embedpdf/core/testing`: `createTestContext` takes `state` (not `initialState`/`reduce`), accepts a real engine document as `doc`, provides a `DocumentsToken` registry for its one document, and `connect(instance)` starts mirrors like the kernel does.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – `documents` follows the contract dictionary: `getActiveId`/`getActive` (was `activeId`/`active`), `list()` returns a readonly array, new `getCount`, `getOrder`/`setOrder`, `retry(id)` for a failed open, `rename`, and `save`/`saveLayer` (was `download`/`downloadLayer`) taking `OperationOptions`. Lifecycle is observable through kernel event hooks: `onOpened`, `onOpenFailed`, `onLocked`, `onClosed`, `onActiveChanged`, `onPagesChanged`. `DocInfo.error` is a `PluginErrorInfo`. `isDev()` no longer needs Node's ambient types. New `BatchResult<T, R>` — the outcome shape of every best-effort batch (`applied`, `skipped`, `failed`).

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – `composeApi(id, slices)` builds a capability from area slices and refuses a member two slices define; `ctx.geometry.tryForPage(ref)` answers null for a page not in the document (beside the throwing `forPage`); the new `@embedpdf/core/testing` entry ships `createTestContext`, a kernel-shaped `ControllerContext` for plugin unit tests.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The documents capability speaks the same language as the rest of the API. `open()` and `retry()` resolve `{ document }`, a `DocumentInfo` (`id`, `name`, `status`, `pageCount`, `hasUnsavedChanges`, and `passwordProvided` or `error` when it's locked or failed), and the same object is what `get(id)`, `getActive()` and `list()` return until one of its fields changes. `DocInfo` is now `DocumentInfo` and `DocStatus` is `DocumentStatus`; `LockedDocumentInfo` and `FailedDocumentInfo` name a locked and a failed document, and `onActiveChanged` carries a `DocumentActiveChangedEvent` (was `ActiveDocumentChangedEvent`). `docInfoEquals` and `docInfoListEquals` are gone: `list()` is the same array until one of its documents changes, so compare by reference.

  `save()` and `saveLayer()` are `download(id?, { mode, signal })` and `downloadLayer(id?, { signal })`. A download refuses with `permission-denied` (and `error.permission` set to `doc.download`) before anything runs; `canDownload(id?)` and `canPrint(id?)` replace `allows()`. A download first settles what plugins hold back, then reads the file inside every `ctx.aroundDownload()` wrap a plugin registered: the actions plugin runs the document's own save actions there. `downloadLayer()` refuses `unsupported` on an engine that keeps layers itself.

  New: `hasUnsavedChanges` and the `onUnsavedChangesChanged` event (`{ documentId, hasUnsavedChanges }`). A change to a local document sets it; a download that read every change clears it. It stays false on an engine that stores each change as it's made.

  New: a `{ kind: 'url', url }` source, which the viewer downloads under the document's loading tab and stops when the tab closes. `open()` takes a `signal`, which closes a document still opening; `unlock(id, { password, signal })` and `retry(id, { signal })` take one too. Every verb rejects with `PluginError`.

  `getPage(page, id?)` takes a `PageRef` or an index, and `getPageAt()` is gone. `get(id?)` reads the document in scope without an id.

  The kernel has settings of its own, the viewer's: `identity` and `scope`, which every document opens with unless it has its own (which replace them), and `accent` and `page { background, shadow }`, which painted parts fall back to. `createKernel({ settings })` registers them, and the kernel has `getSettings()`, `updateSettings()`, `resetSettings()` and `onSettingsChanged`; an identity is replaced whole. `VIEWER_DEFAULTS`, `ViewerSettings` and `ViewerPageSettings` are exported, and so is `Identity`.

  `documentState` and `documentsState` declare the documents' state (the document in scope; every document and the active one) for the framework adapters. A settings declaration may name `whole` settings, which a change replaces instead of merging into. The test context has `aroundDownload()` and `download(read)`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `documents.save()` and `documents.saveLayer()` wait for what plugins hold back before they read the file, so the bytes have everything the user sees: text typed a moment ago, a drawing waiting for its next stroke, the text being typed in a form field, and writes still on their way. A plugin registers what it holds back with the new `ctx.onSettle(flush)`, and the kernel runs every flush and waits for it before it reads the file. The caller's `signal`, or closing the document, cancels the wait with `operation-cancelled`. A flush that fails is reported, and the file is then written from what the engine has.

  `ctx.serialQueue()` returns a queue with `idle()`, which resolves once everything queued so far has finished; a plugin whose queue carries document writes registers `ctx.onSettle(() => queue.idle())`. The test context from `@embedpdf/core/testing` has `settle()`, which runs the flushes as a download does.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Plugins ask about form fields one at a time: `ctx.allowsField('fill' | 'sign', field)` and `ctx.assertAllowedField(action, field, operation)`, which refuses with `permission-denied` naming what it would take (`fields:fill:group=buyer`). `resolvePageLayers` and the `PageLayerRights`, `PageRenderLayers` and `AnnotationAppearanceImage` types come from `@embedpdf/core`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) –
  - `PredictedOp`: `forms.restore` carries the field's widget rows, and `forms.restoreWidget` (a widget's row and its field) is new, so the undo of a form change shows the field and its widgets as they were, before the engine answers.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Kernel guarantees for the v3 authoring pattern. `planPlugins` rejects duplicate plugin ids, duplicate capability providers, and workspace plugins that require document-scoped tokens, naming both sides. Contexts resolve only declared tokens in development. State slices are held by per-instance leases: closing a document revokes its lease synchronously, so a retained context can neither read nor write a reopened document (`DocumentMeta.instanceId`). `documents` gains `listPages`, `getPage`, `getPageAt`, `getPageIndex` and `getRevision`. New: `PluginError` with stable codes and `toPluginError`, `EventHook` subscriptions with `{ signal }`, and the `create()` controller hook on `definePlugin` whose `ControllerContext` provides a guarded `doc` handle, `events.source`, `geometry.forPage`, `listen`, `waitFor`, `serialQueue`, `latest`, `acquire`, `assertPageRef` and `getPage`.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Re-export `PageRef`, `toPageRef`, `pageRefsEqual`, `encodePageKey` and `decodePageKey` from the kernel entry, and describe `DocumentMeta.pages[].ref` as the durable page identity.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Re-exports the `AnnotationRef` type.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – `ResourceStatus`, `ChangeOrigin` and `originOf` join the kernel vocabulary; `PluginErrorInfo` / `toPluginErrorInfo` give events and state a serializable error summary; a lane cancellation carries `{ runId, reason }` in its details.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A refused call names what was missing. `PluginError` has `permission`: on `permission-denied`, the permission the session lacks, as the engine names it (`'doc.forms.fill'`, `'annotations:update'`), and null otherwise. `toPluginError` fills it from the engine's refusal, whether it arrives as a `PermissionDenied` or, from a worker or the server, as an `EngineError` with `details.required`; when any of several permissions would have done, it is the first, and `details` keeps the rest. `PluginErrorInfo` carries it too. Plugins check with two context helpers: `ctx.allows(permission)`, the same answer the engine enforces with, and `ctx.assertAllowed(permission, operation)`, which throws `permission-denied` ("`operation` requires `permission`") with `permission` set. A `Permission` is a document capability or `'annotations:create'`. Both read the bound document, so in a workspace plugin, which has none, they throw as reading `ctx.doc` does.

  Events carry the engine's origin as it is. `ChangeOrigin` and `originOf()` are gone: a plugin event's `origin` is the engine event's `EventOrigin`, now exported from `@embedpdf/core`, so `locality` is `kind` and `actorId` is `sub`, and `ts`, `serverId` and `tx` come along.

  `ctx.pageOf(page)` resolves a page argument as verbs take it, a `PageRef` or a zero-based index, and throws `not-found` for a page the document doesn't have. `ctx.getPage(page)` takes the same argument for reads, and returns `null` for a page the document doesn't have, so a read made while a page is deleted doesn't throw. `ctx.cancellable(signal, task)` runs an engine call the caller can cancel: when the signal fires, the call is aborted and the promise rejects `operation-cancelled` at once. The serial queue takes `{ signal }` as its second argument and skips an operation whose signal fired while it waited; `createSerialQueue(capability)` takes the plugin id for that error. The test context from `@embedpdf/core/testing` has the same four helpers, and its default document may create annotations.

  `ObjectNumberUnavailable` and `LayerFull` refusals map to `conflict`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Re-exports `PageReorderResult` and `PagePosition` in place of `PageMoveResult`; the page registry follows `pages.reordered`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Plugins declare their settings once, in their definition: `definePlugin({ settings: { defaults, registered: config } })`. The kernel builds one store per plugin registration when it plans the plugin list, so the settings exist before any document opens: `kernel.settingsOf(token)` reads and changes them with no document, and an app may set them before opening one. Inside `create`, `ctx.settings()` returns `get()` for the plugin's own code and `api`, the four settings calls to spread into the capability: `getSettings()`, `updateSettings(changes)`, `resetSettings()` and `onSettingsChanged`, which carries `{ settings, changed }`, `changed` naming the top-level settings whose value changed. The settings belong to the plugin as the app registered it, not to one document: `updateSettings()` changes every open document and the ones opened later, and wakes every reader. Changes merge the same way everywhere: plain objects merge key by key, arrays and other values replace, and `undefined` leaves a setting as it is. `resetSettings()` goes back to what the app registered, not to the plugin's defaults, and `onSettingsChanged` fires once for each call that changed a setting. The test context from `@embedpdf/core/testing` takes the same `settings` declaration. The types are exported as `Settings`, `SettingsApi`, `SettingsChangedEvent`, `SettingsDeclaration`, `SettingsOf` and `DeepPartial`.

  `definePlugin` takes no type arguments: it reads the capability type from `token`, the state type from `state` and the settings type from `settings.defaults`. `create` is checked against those types, never a source of them, so a controller that returns less than the capability is a type error, and so is a controller that reads settings in a plugin whose definition declares none. A plugin without `state` is stateless (`void`); a plugin without `settings` has `NoSettings`, the default of `PluginContext`'s and `PluginDef`'s settings parameter, and `ctx.settings()` throws there. `NoSettings` is a type of its own so that one plugin list can hold plugins with and without settings.

  Workspace plugins follow the document in scope. A plugin declares `inScope(api, documentId)`, the capability as seen from inside a document's scope, and resolving its token for a document (`kernel.capability(token, documentId)`, `kernel.tryCapability`, `ctx.forDocument`, or a document-scoped plugin's `ctx.get`) returns that view: the same object on every call while the document is open. Without a document, the capability itself is returned, as before. The documents capability does the same: resolved for a document, `save()`, `saveLayer()`, `listPages()`, `getPage()`, `getPageAt()`, `getPageIndex()`, `getRevision()` and `allows()` default to that document instead of the active one.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Plugins declare their state once with `defineState(token, { read, empty })`: `read(capability)` returns the plugin's state object from its getters, and `empty` is that object while no document is open. The types check `empty` against what `read` returns, so a missing field or a value of the wrong type is a type error, and so is an extra field written inline. The declaration names no framework, so every framework adapter builds its state hook from the same declaration. `empty` is frozen, because every reader shares it. `shallowEqual(left, right)` compares two objects or arrays field by field by identity, which is how adapters decide whether declared state changed. The type is exported as `StateDeclaration`.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The documents capability has `canOpenFiles()`: whether `open()` can open a file from the user's computer (its bytes, or a URL the viewer downloads). It is the engine's `canOpenFiles`, so it's `true` with the local engine and `false` with the cloud engine. The test context's documents answer `false`, since they open nothing.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – A mirror can load on demand: with `onDemand: true` in its spec it stays `idle`, folding confirmed events, until `ensureLoaded()` or `refresh()` asks for its first load, and a resync or a fold's `reload()` before then reads nothing. `Mirror.ensureLoaded()` loads unless loaded or loading: it shares a load in flight, resolves at once when loaded, and tries again after a failed load. `defineState` takes an optional `ensure(capability)`, the verb that loads on-demand state, which each framework's state hook calls for the document it reads.

### Patch Changes

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Re-export `annotationKey` and `refFromStableId` from the kernel package.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Add what every framework adapter's plugin API shares. `standInFor(kernel, token)` is what a document plugin's API reaches while there is no ready document: reading a member never throws, a call refuses with `not-ready`, and the settings calls work. `isReadMember(name)` says whether a member is a read (`get*`, `list*`, `is*`, `has*`, `can*`), which every adapter tracks in templates and derived values.

  `createCapabilityToken` takes `promises`, the members that return a promise (`setValue`, `comments.reply`); the type asks for every one of them. Without a document, the stand-in returns a rejected promise with `not-ready` from those members, so `.catch()` sees the refusal, and throws from the others; `returnsPromise(token, path)` answers from the token.

  Add `viewerSettingsOf({ identity, scope, accent, page })`, the viewer's settings as a framework's viewer takes them (a setting left out is its default), `VIEWER_WHOLE_SETTINGS`, and `mergeSettings(settings, changes, whole)`, the merge every settings store applies.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – While a document's plugins are built, the store holds its notifications, and listeners hear of the whole bring-up once every plugin is there. A plugin's `create()` that wrote state used to wake listeners at once, and one reading a plugin not built yet had it built out of order, before the plugins it looks for as it's created: the form plugin then found no annotation plugin, and design mode never lent its widgets.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – A document plugin asked for while it is being created (a listener reading it during a store notification its own `create` caused) is no longer built a second time: the read finds no capability yet. A second instance took the first one's state and mirror cells, so a mirror such as the annotation records never loaded.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `documents.retry(id)` opens a failed document again in its own tab: the tab keeps its id and its place, it shows `loading` at once, and the active document stays the active one. The tab no longer closes and comes back at the end, so `onClosed` and `onActiveChanged` don't fire for a retry.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – An engine error saying the engine got an answer it doesn't understand (`WireFormat`, as from a server of another version) is `operation-failed`, not `invalid-input`: a document that fails to open that way no longer says its file isn't a PDF or is damaged.

## 3.0.0-next.14

## 3.0.0-next.13

## 3.0.0-next.12

### Minor Changes

- [#803](https://github.com/embedpdf/embed-pdf-viewer/pull/803) by [@bobsingor](https://github.com/bobsingor) – `PluginContext.tryForDocument(token, documentId)` — `forDocument` for an OPTIONAL dependency: null when the plugin is not installed or that document is not ready, never a throw (a workspace plugin reaching a sibling's document-scoped lens without requiring it).

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Adds `createEventHook` (the one capability-event primitive: subscribe-only `EventHook<T>` face, snapshot fan-out, listener error isolation, inert after dispose) and `createSerialQueue` (promise-tail serialization) to the core toolkit.

## 3.0.0-next.10

### Minor Changes

- [#788](https://github.com/embedpdf/embed-pdf-viewer/pull/788) by [@bobsingor](https://github.com/bobsingor) – Export `PermissionDenied` and add `DocumentsCapability.allows()` so hosts can
  gate document-level print and download controls using the active document's
  security policy.

## 3.0.0-next.9

### Minor Changes

- [#772](https://github.com/embedpdf/embed-pdf-viewer/pull/772) by [@bobsingor](https://github.com/bobsingor) – Export `PageInsertResult`, `PageInsertBlankSpec`, and `PdfSize` from the main
  package so applications and plugins can type page-creation operations.

## 3.0.0-next.8

## 3.0.0-next.7

### Minor Changes

- [#775](https://github.com/embedpdf/embed-pdf-viewer/pull/775) by [@bobsingor](https://github.com/bobsingor) – Add optional hints to capability tokens so missing-dependency errors can tell integrators which plugin to register.

## 3.0.0-next.6

## 3.0.0-next.5

## 3.0.0-next.4

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the rebuilt framework-independent EmbedPDF kernel. It owns serializable state, typed plugin capabilities, effects, scopes, and plugin lifecycle without depending on the DOM or a rendering engine.
