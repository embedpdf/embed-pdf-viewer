# @embedpdf/angular

## 3.0.0-next.17

## 3.0.0-next.16

### Minor Changes

- [#891](https://github.com/embedpdf/embed-pdf-viewer/pull/891) by [@bobsingor](https://github.com/bobsingor) – New entry `@embedpdf/angular/attachment`: `withAttachment()` and the `EpdfAttachment` service, with the files, the selected files, the load state, `canAdd()` and `canDownload()` as signals, the calls that select, add, remove, save and go to files, and `changed$` and `resynced$`. Reading it reads the document's attachments.

- [#885](https://github.com/embedpdf/embed-pdf-viewer/pull/885) by [@bobsingor](https://github.com/bobsingor) – `@embedpdf/angular/outline`: `withOutline()` and the `EpdfOutline` service for the document's outline (its bookmarks): its State table as signals (`rows()`, `current()`, `canEdit()`, …), its calls, and the streams `changed$` and `resynced$`. Reading the service reads the outline.

- [#876](https://github.com/embedpdf/embed-pdf-viewer/pull/876) by [@bobsingor](https://github.com/bobsingor) – Tapping a form field or editing a free text box on iOS no longer zooms the page in: their editors lay their text out at 16 px or more and draw it back at the page's size. `[epdfRichTextEditor]` now also makes your element fill its parent at that legible size, so draw the box's fill, border and padding on the parent: anything on the element itself scales with its text.

- [#890](https://github.com/embedpdf/embed-pdf-viewer/pull/890) by [@bobsingor](https://github.com/bobsingor) – `EpdfPageEdit` has `selected()`, the selected pages as a signal, and `select(pages)`. Page-edit positions are `position` now, in place of `placement`.

### Patch Changes

- [#883](https://github.com/embedpdf/embed-pdf-viewer/pull/883) by [@bobsingor](https://github.com/bobsingor) – The runtime hands the kernel the browser's printer (`browserPrinter()` from `@embedpdf/web`), and the documents service has `preparePrint()`, `print()` and `getPrintQuality()`.

- [#895](https://github.com/embedpdf/embed-pdf-viewer/pull/895) by [@bobsingor](https://github.com/bobsingor) – A renderer that draws free text itself with `[epdfRichTextEditor]` shows the text of every text box, including the ones saved in the PDF. Before, a saved box that wasn't being edited drew empty until it was double-clicked. Typing in such a box works too: the element takes focus when editing starts, where before the keys went to the page.

## 3.0.0-next.15

### Minor Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Annotations in Angular: `@embedpdf/angular/annotation`.
  - `withAnnotation(options)` and `inject(EpdfAnnotation)`: the plugin's methods (`create()`,
    `update()`, `delete()`, `move()`, `export()`, `import()`, …), the State table as signals
    (`status()`, `selected()`, `hovered()`, `editing()`), the parts as namespaces
    (`selection`, `draft`, `text`, `tools`, `stamps`, `links`), every event as a stream
    (`created$`, `writeFailed$`, `selectionChanged$`, `tools.defaultsChanged$`, …) and the
    settings. The reads a template follows are members that take a value or a function:
    `watch(filter)`, `anchorOf(ref)`, `selection.properties()`, `tools.defaultsOf(id)` and
    `tools.propertiesOf(id)`. The checks (`canCreate()`, `canDelete(ref)`,
    `selection.canGroup()`, `stamps.isArmed()`) follow the document in a template.
  - `inject(EpdfComments)`: every thread with its page label as `threads()`, one as
    `threadOf(ref)`, the verbs (`reply()`, `setText()`, `setStatus()`, `setMarked()`, `delete()`,
    `deleteThread()`), the checks and `threadChanged$`.
  - `<epdf-annotation-layer>` draws a page's annotations, the selection's outline and handles, the
    tool's preview and the text boxes being typed in. Your own look for some annotations is an
    `<ng-template [epdfAnnotation]="predicate" let-annotation let-frame="frame">` inside it (a
    subtype works too: `epdfAnnotation="stamp"`); it draws into a frame placed, turned and scaled
    like the annotation, gets the layer's own drawing as `native`, and with
    `epdfAnnotationInteractive` (or a function of the active tool) takes the pointer.
    `<ng-template epdfHandle>` and `<ng-template epdfRotationHandle>` draw the handles your way.
  - `[epdfRichTextEditor]="annotation"` makes your element a text box's editor in a look, with the
    box's body style and `editing()` (`#editor="epdfRichTextEditor"`).
  - `<epdf-annotation-menu>`, `<epdf-annotation-draft-menu #menu>` (with `draft()`) and
    `<epdf-annotation-rotation-badge>` float your UI next to the selection, a polygon being drawn
    and a turn in progress, inside `<epdf-stage>`.
  - `withFilePicker(provider?)` gives the stamp and attachment tools their file: the browser's
    file dialog, your own function, or `null`, for every document the viewer opens.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Add the Angular services for working with documents. `@embedpdf/angular/view-manager` has `withViewManager()` and `EpdfViewManager`, with `panes()` and `focusedPaneId()` as signals, the calls that split, close and move panes and their tabs, and `paneCreated$`, `paneRemoved$`, `focusChanged$` and `documentMoved$`. `@embedpdf/angular/page-edit` has `withPageEdit()` and `EpdfPageEdit`, to rotate, move, insert, delete and extract pages. `@embedpdf/angular/metadata` has `withMetadata()` and `EpdfMetadata`: the standard fields as `fields()` and their load state as `status()`, `update()`, `refresh()`, `canUpdate()`, `updated$` and `resynced$`, and your own fields as the `custom` namespace (`custom.fields()`, `custom.status()`, `custom.update()`, `custom.refresh()`, `custom.updated$`), which is never itself a signal. `@embedpdf/angular/actions` is now `withActions(config)`, `EpdfActions` (the calls, the checks, the settings and the streams such as `diagnosticReported$`) and `withActionsUi(handlers)`, which installs the browser's defaults for websites, printing and alerts on the active document's actions, in the same change that makes it ready; `handlers` replace any of them, and can be a function that runs once in an injection context, so they can use your services. `injectActionsUiAdapter()` is gone. Each entry re-exports its plugin, so registration travels with the UI.

  Every plugin service now has `getSettings()` next to `settings()`, working with or without a document. A check (`canUpdate()`, `canCopy()`, `isScriptingEnabled()`) read in a template, a `computed()` or an `effect()` is read again after each change of the viewer and wakes its reader only when its answer changes, so a button it disables follows the document, the selection and the permissions. A namespace's calls are built with `CapabilityBinding.namespaceMethod()`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Forms and signatures in Angular: `@embedpdf/angular/form` and `@embedpdf/angular/signature`.
  - `withForm(config)` and `inject(EpdfForm)`: the plugin's methods for reading, filling, form
    data and building (`setValue()`, `importValues()`, `export()`, `validate()`, `create()`,
    `update()`, `delete()`, …), the State table as signals (`fields()`, `status()`, `formKind()`,
    `selectedField()`), every event as a stream (`valueChanged$`, `validationRejected$`,
    `fieldCreated$`, …) and the settings. The checks (`canFill()`, `canDesign()`) follow the
    document in a template.
  - `form.valueOf(ref)` is one field's value as a signal, which wakes only when that field
    changes. `form.controlOf(ref)` is a field as a Reactive Forms `FormControl` for an input of
    your own (`<input [formControl]="name" />`): it holds the field's value, takes every change
    of it, fills in the field with the form's checks and scripts when it changes, and is disabled
    while the field can't be filled in. It needs `@angular/forms`, now an optional peer
    dependency.
  - `<epdf-form-layer>` puts a real HTML control over each field on its page: a text box that
    edits in the field's font, checkboxes and radio buttons, a dropdown, a list that keeps its own
    scroll position, push buttons that run their action, and "sign here" on a signature field
    with the signature plugin. A press on a field stays out of the page below and still reaches
    the field's PDF actions; the colors follow the form settings and the `--epdf-form-*` CSS
    variables.
  - `withSignature(config)` and `inject(EpdfSignature)`: signing, filling and checking signature
    fields (`sign()`, `placeMark()`, `fillField()`, `validate()`, …), `signatures()`,
    `protection()`, `target()`, `busy()`, `pending()` and `status()` as signals, the events as
    streams (`signed$`, `invalidationPredicted$`, `targetChanged$`, `signRequested$`, …), the
    settings, and `signerRows()`: the people whose marks the stamp plugin holds, each with their
    signatures and initials. The signers (`webCryptoSigner`, `remoteSigner`, `personalSigner` with
    `indexedDbKeyStore`, `createTestSigner`) come with the entry.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The adapter is set up and used the Angular way.
  - `provideEmbedPdf(config, ...features)` replaces `<epdf-viewer>`. It works in a component's
    `providers` (and that component can inject the viewer's services), a route's, or the app
    config. Plugins are features: `withStage()`, `withRender()`, `withInteraction()`,
    `withFeedback()`, in place of `stagePlugin()` arrays. `engine` may be a function that returns
    a promise (`() => import('@embedpdf/engine').then((m) => m.localEngine())`); the config also
    takes `identity`, `scope`, `accent` and `page`.
  - One service per plugin, in place of the `inject*()` functions: `inject(EpdfDocuments)`,
    `inject(EpdfDocument)` (with `pages()`), `inject(EpdfRender)`, `inject(EpdfInteraction)` (with
    `overrideCursor()`), `inject(EpdfViewer)` (`settings()`, `updateSettings()`, `status()`). Each
    has the plugin's methods, its State values as signals, its events as RxJS streams
    (`openFailed$`), and its settings. Under `[epdfDocumentScope]` they act on that document.
    `pluginService()` builds a plugin's service.
  - `<epdf-stage #stage="epdfStage">` is the Stage's API: every method, its State as signals
    (`zoomLevel()`, `currentPageIndex()`, `activeRules()`), `settings()`, `scrollMetrics()`, and
    streams (`pageChanged$`, `cameraChanged$`). New: `[(page)]`, `[(zoom)]`, and `[document]`,
    which opens a document for the Stage and follows the value. `injectZoom()`, `injectPages()`,
    `injectLayout()`, `injectStageSettings()` and `[epdfStageScope]` are removed.
  - `*epdfDocumentGate="let document; fallback: opening; locked: locked; error: failed"`: the
    ready document as context, and templates for a document waiting for its password and one that
    failed to open.
  - New: `<epdf-scrollbar>`, `<epdf-anchored>`, the render layer's sharp tiles when zoomed in,
    `epdfTheme()`, `saveFile()` and `mountWebFont()`.
  - Setup mistakes are numbered errors with the fix and a link: `EPDF-101` to `EPDF-105`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Stamps, measurements and redaction in Angular: `@embedpdf/angular/stamp`, `/measurement` and
  `/redaction`. Each entry re-exports its plugin, so registration travels with the UI.
  - `withStamp(options)` and `inject(EpdfStamp)`: the Stamps page's methods (`importLibrary()`,
    `createAsset()`, `armAsset()`, `placeAsset()`, …), the armed stamp as `armedAsset()`, the events
    as streams (`libraryChanged$`, `armChanged$`, …) and the settings. The libraries are
    `libraries()`, one library's stamps `assetsOf({ libraryId })`, and a stamp's picture
    `previewUrlOf(id)`, an image URL that follows the stamp and a picture that arrives later, and is
    released with the component that asked for it. `assetsOf()` and `previewUrlOf()` take a value
    or a function that reads signals. `persistStampLibraries(stamp, store)` and
    `restoreStampLibraries(stamp, store)` take the service, and `indexedDbByteStore()` is the
    browser's store for them.
  - `withMeasurement(options)` and `inject(EpdfMeasurement)`: the scales, calibration and
    measuring, `busy()`, `calibrationRequest()` and `lastReports()` as signals, a page's scale as
    `scaleOf(page)` and a measurement's `{ kind, value, label }` as `readoutOf(ref)`, the events
    as streams (`scaleChanged$`, `calibrationRequested$`, …) and the settings.
  - `withRedaction(options)` and `inject(EpdfRedaction)`: marking, applying, `pendingCount()`,
    `applying()` and `lastResult()` as signals, the marks waiting as `pending()` and one page's as
    `pendingOn(page)`, the checks (`canApply()`, `canUnmark(ref)`, …), which follow the document
    in a template, `applied$` and `pendingChanged$`, and the settings.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Your app's UI in Angular: commands, the toolbar, panels and translations.
  - `@embedpdf/angular/commands`: `withCommands({ commands })`, `standardCommands`, and
    `inject(EpdfCommands)` with the plugin's methods, `executed$`, the settings, and
    `commandOf(id)`, one command as a signal. `<button [epdfCommand]="'zoom:in'">` runs a command
    on click and keeps the button's `disabled`, `aria-pressed`, `title` and `hidden` in step; its
    template reference (`#zoomIn="epdfCommand"`) has `label()`, `icon()`, `shortcut()`, `enabled()`
    and `active()`. Keyboard shortcuts: `withCommandShortcuts()` for the whole page, or
    `epdfCommandShortcuts` on the element around one viewer. `formatShortcut()` shows a shortcut
    for the platform.
  - `@embedpdf/angular/toolbar`: `<epdf-toolbar [bar]>` fits itself to its width (items get
    smaller, groups fold, the rest goes into a "More" menu) and takes every part as a template:
    `epdfToolbarCommand`, `epdfToolbarCustom="name"`, `epdfToolbarCollapsed`,
    `epdfToolbarGroupTrigger`, `epdfToolbarSeparator`, `epdfToolbarOverflowTrigger` and
    `epdfToolbarOverflowMenu`, each with a plain default. The bar's vocabulary (`group()`,
    `item()`, `custom()`, `addItem()`, …) is exported with it.
  - `@embedpdf/angular/shell`: `withShell()` and `inject(EpdfShell)`, with `openSurfaces()` and
    `openMenus()` as signals, the events as streams, and `shell.surface('comments')`: `isOpen()`,
    `props()`, `open()`, `close()` and `toggle()`, closed and doing nothing until a document is
    open. `<button epdfPanelToggle="comments" epdfPanelToggleExclusive="right">` toggles a panel
    and sets `aria-expanded`.
  - `@embedpdf/angular/i18n`: `withI18n(options)`, `inject(EpdfI18n)` with `locale()`,
    `direction()`, `locales()`, `loading()` and `translator()` as signals, and the `epdfT` pipe:
    `{{ 'toolbar.save' | epdfT }}`, `{{ 'search.results' | epdfT: { params: { count } } }}`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Pages on their own, text selection, search and links in Angular, each a secondary entry point.
  - `@embedpdf/angular/page-view`: `<epdf-page-view [page] [width]>` shows one page without a
    Stage, with the layers between its tags; `[documentId]` (the document `[epdfDocumentScope]`
    names, else the active one, without it), `[pageFrame]`, and the `epdfFallback` and
    `epdfPageChrome` templates. It takes pointer input for the tools when the interaction plugin
    is registered, and anchored UI inside it is placed on screen so nothing around it clips it.
  - `@embedpdf/angular/selection`: `withSelection()`, `inject(EpdfSelection)` (the selection's
    methods, `hasSelection()`, `isSelecting()`, `range()` and `pages()` as signals, `changed$`,
    `committed$`, `cleared$`, the settings), `<epdf-selection-layer>`, `<epdf-selection-menu>` and
    `<epdf-selection-handles>` inside `<epdf-stage>`, `<epdf-selection-clipboard>` and
    `copySelection()`.
  - `@embedpdf/angular/search`: `withSearch()`, `inject(EpdfSearch)` (the search's methods, its
    state as signals, `hits()` and `hitsOn(page)`, `completed$` and the other events, the
    settings) and `<epdf-search-layer (hitClick)>`, whose matches take clicks only while
    `(hitClick)` is listened to.
  - `@embedpdf/angular/link`: `withLink()`, `inject(EpdfLink)` (with `activated$`), and
    `<epdf-link-layer>` with the `<ng-template epdfLink let-link let-native="native">` template.
    While either is there, a website link opens in a new tab.
  - `@embedpdf/angular/interaction` adds `<epdf-page-pointer-source>`, a page's pointer input for
    a page surface of your own.
  - `@embedpdf/angular/testing`: `EpdfStageHarness` and `EpdfSearchLayerHarness`, test harnesses
    built on `@angular/cdk/testing` (an optional peer dependency).

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The stage pages facade names its backward step `previous` instead of `prev`, matching the stage's `previousPage`.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Follows the documents, interaction and stage contracts: `injectDocuments` exposes the renamed document operations and a readonly `docs` signal; the stage facades read through `getSettings` and the page registry (`injectPages().pageCount`, `injectPageList().pages` come from `documents.listPages`); `<epdf-stage>` binds the host lens; the actions adapter navigates with `goToPageIndex`. `<epdf-render-layer>` binds the render host lens (`renderSource`, `getSourceKey`). Phase 4: `injectCapabilityEvent`, `injectDocumentEvent` and `injectStageEvent` subscribe a hook for the injector's lifetime; `[epdfStageScope]` binds a subtree to a stage lens and `<epdf-stage>` provides its own lens to projected content, so the stage facades take an optional token (`token` on `<epdf-stage>` is optional too).

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The page's layers say what they paint:
  - **`<epdf-render-layer>`** leaves out of the page picture what a layer on the page paints: the annotations while `<epdf-annotation-layer>` is there, the form fields while `<epdf-form-layer>` is. Its `annotations` and `formFields` inputs decide for themselves when set; left out, a part no layer paints is drawn when the user may read it. Setting `annotations` to `false` next to an annotation layer is no longer needed.
  - **`<epdf-form-layer>`** paints each field at rest as the engine draws it, in the state it shows, with the controls above while the tool fills forms. Hidden widgets get neither.
  - `canFill` and the signature checks take the field.
  - **Runtime:** `paintsPagePart()` and `injectPaintedParts()` replace `publishPageLayerFact()` and `PageLayerFacts`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `@embedpdf/angular/history`: undo and redo, `withHistory()` and `inject(EpdfHistory)` (`undo()`, `redo()`, the signals `canUndo()`, `canRedo()`, `undoLabel()`, `redoLabel()`, and `undone$`, `undoFailed$`).

  An annotation or a field that shows again before the page's next pictures arrive, such as one an undo brings back, shows its picture at once.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `epdfSelectionClipboard` on an element of yours (`<div tabindex="0" epdfSelectionClipboard>`), the same shape as `epdfCommandShortcuts`, copies only while focus is inside it, for a page with more than one viewer, as that directive does for the other keys. `<epdf-selection-clipboard />` still copies anywhere on the page. `EpdfSelectionClipboard` is now a directive serving both; import it as before.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The `epdfSurfaceFocus` directive (`<input epdfSurfaceFocus="search" epdfSurfaceFocusSelect>`) puts the cursor in its element when the panel it names asks for it (`open(id, { focus: true })`, or a command whose `panel` says `focus`), also when the element appears while the request is up; `epdfSurfaceFocusSelect` selects an input's text, so typing replaces it.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – The page context, page surfaces and stage facades expose `ref: PageRef` instead of a bare page object number.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The form layer draws a widget with the painter (SVG text in the engine's own faces) while its look is pending or its picture is of an older version, and the engine's picture otherwise, taken from the form plugin: a typed value, a calculation or a restyle shows at once. The annotation layer applies the same rule, and takes its appearance scale from the render plugin: in design mode a form field being resized, or one restyled or newly placed, shows at once, drawn by the same painter. A scene's text is drawn in the faces its glyphs name, mounted while it shows. `@embedpdf/angular/runtime` has `<svg:g [epdfSvgShapes]>`, a scene's shapes as SVG elements. A text field's editor shows the text being typed where the engine will draw it, in the same face and size.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `withCommandShortcuts({ onRefused })` and the `epdfCommandShortcuts` directive's `(refused)` output report a key whose command is turned off or not allowed, with why (`RefusedShortcut`); the key no longer reaches the browser. `<epdf-selection-clipboard>` fires `(refused)` when Ctrl/Cmd+C or the browser's Copy meets a selection the user may not copy.

  The toolbar entry exports the bar vocabulary only: `ChromeSchema`, `FrameSchema`, `MenuSchema`, `MenuSection`, `chromeHelpers`, `defineChrome`, `validateChrome`, `addItem`, `removeItems` and `replaceItem` are gone with the chrome schema they edited. `custom(name)` without a command makes an item that never leaves the bar.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `EpdfDocuments` has `canOpenFiles()`, the documents capability's: whether the engine opens a file from the user's computer.

  `commandOf(id)` always gives a command, and so does the `epdfCommand` directive's `command`: an id no plugin registered comes back labelled with its id, neither visible nor enabled (so its button is hidden), and warns once in development with the closest id there is. `run()` on the directive always returns its promise.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `<epdf-toolbar orientation="vertical">` stands a toolbar on its side: it measures heights and fits the height it's given, stacks its sections top, middle and bottom, and draws every command at `'icon'`, with the default menus opening beside it. `<epdf-toolbar>` is now a `role="toolbar"` with `aria-orientation`, so an `aria-label` on it names it, and one tab stop: the arrow keys along it move between its items (the first focusable element of your own item is its stop), past disabled ones, with Home and End to the ends and Left and Right swapped in right-to-left text. The default "More", folded-group and group-trigger menus open on their first row and take the arrow keys, typeahead, Enter, and Escape, which closes the menu and puts focus back on its button; the toolbar drawing again while one is open leaves focus where it is. The measuring copies are `inert`. `[separatorWidth]` is the separator's thickness across the toolbar, and `EpdfToolbarCustomContext.measure` takes a length: the item's height in a vertical toolbar.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `provideEmbedPdf({ kernel })` gives an injector a kernel someone else created and owns: every service, component and directive under it works against that kernel, and the injector neither starts nor destroys it. Its plugins are the kernel's, so a feature's services, providers and setup work while its plugins aren't registered again. The full viewer's Angular wrapper gives the templates you put in the viewer one of these.

  `EpdfStageRef` in `@embedpdf/angular/stage` is the Stage's API to inject: every method of the Stage, its state as signals (`zoomLevel()`, `currentPageIndex()`, `pageCount()`, …), `settings()` and its events as streams (`pageChanged$`, …). Inside `<epdf-stage>`, `inject(EpdfStageRef)` is that Stage, with its `[token]` view and its `[document]`; anywhere else under a viewer it drives the main view of the document in scope, or of the active document, and with no document its signals read empty and its methods refuse with `not-ready`. `<epdf-stage>` extends it, so the two have the same members; from around a Stage, `#stage="epdfStage"` and `viewChild(EpdfStage)` still reach it. `withStage()` provides it.

  `<epdf-toolbar>`: a custom item whose `epdfToolbarCustom` template draws nothing in the `'measure'` layer, but draws in the `'live'` one, is measured where it renders, by the length it reports with `measure`; its empty copy in the hidden measurement layer no longer reports a length that competes with it.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `EpdfMetadata` loads the metadata of the document it reads, once that document is ready, and has `ensureLoaded()`; `pluginService()` takes an `ensure` for any plugin that loads its state on demand (its state declaration's, by default).

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `<epdf-stage>` loses its `interaction`, `panFallback` and `zoomGestures` inputs: they are the view's settings now (`stagePlugin({ token, interaction: false })`, or `updateSettings()` while the app runs). `injectLayout()`'s setters change the settings through `updateSettings()`.

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The type declarations are complete for an app that compiles against the built package.
  - Every service built with `pluginService()` (`EpdfDocuments`, `EpdfSearch`, `EpdfForm`, …) has
    its methods, signals and streams in the declarations. A service's base class is now named,
    `PluginServiceClass<SearchCapability, …>`, and the app's compiler works out each member from
    the plugin's types, so the declarations no longer import packages `@embedpdf/angular` doesn't
    depend on (`@embedpdf/engine-core`, `@embedpdf/core-acrojs`).
  - No entry point's declarations import the entry point itself by its public name
    (`@embedpdf/angular/runtime` inside the runtime entry point, `@embedpdf/angular/stage` inside
    the stage one).
  - New type: `PluginServiceClass`, what `pluginService()` returns.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `<epdf-render-layer>` fixes, found in the docs' browser pass:
  - The page picture's URL is set on the image the moment it exists, like the other adapters, instead of through a binding. A binding applied it at the next change detection, and a page redrawn before that had already revoked it: the image lost its picture until the next one came (a failed `blob:` load in the console).
  - A sharp tile tells the render plugin it's gone as its element is destroyed. It used an output, which Angular drops once the directive is destroyed (NG0953), so the plugin kept counting the tile as painted.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `<epdf-render-layer>` in an `<epdf-page-view>` given another page releases the old page's tile demand (it was kept until the layer went, and then the new page was released instead), and plans the new page even when its size is the same.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The annotation, form, measurement, signature and stamp entry points use the shared implementations in `@embedpdf/web` and the plugins; nothing they do changes. `SignerRow` is the signature plugin's own type now (the same fields, read-only), and `restoreStampLibraries` from `@embedpdf/angular/stamp` is the plugin's own, which takes `EpdfStamp` as it is.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A service method named `get*` or `list*` is now a read too, like `can*`, `is*` and `has*`: called in a template, a `computed()` or an `effect()`, it follows its answer, as in every adapter.

  Without a document, a service method that returns a promise (`form.setValue`, `signature.placeMark`) now returns a rejected promise with `not-ready`, so `.catch()` sees it; other methods still throw.

  The page context's conversions, the Stage's page layout and projector, the page view's transform and projector, the page pointer listener, the scrollbar's geometry and presses, the tool cursors, anchored UI's measuring and the settings merge now come from `@embedpdf/web` and `@embedpdf/core`, shared with every framework.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The toolbar, commands, search, selection and link bindings use the shared implementations in `@embedpdf/core-ui`, `@embedpdf/web` and the plugins; nothing they do changes. `BoundCommand` comes from `@embedpdf/plugin-commands` (the same fields), the toolbar's view types are aliases of core-ui's, and `copySelection` is `@embedpdf/web`'s, re-exported.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `injectDocuments()` follows the documents capability: `download` and `downloadLayer` (were `save` and `saveLayer`), `retry(id, options)`, and `docs` as `DocumentInfo[]`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `EpdfForm.canRestoreAttribution()` and `EpdfForm.canWriteScripts()`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `EpdfForm.reorderCalculations()`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `EpdfForm.getWidget()`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `EpdfForm.deleteWidget()`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) –
  - `controlOf()` follows its field at once: the form shows a write as soon as it's made, so the control takes the field's value, a refused or rewritten one included, without waiting for the engine.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `EpdfPageEdit.reorder()` and `EpdfAnnotation.reorder()` with `reordered$`, in place of `move()` and `moved$`.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The toolbar's default "More" menu no longer lays an invisible backdrop over the whole page: it closes on a press anywhere outside it and its button.

  The render layer no longer adds a `<style>` element to the page (the tile fade's keyframes are gone with `tiles.fadeMs`), so it needs no nonce under a `style-src` without `'unsafe-inline'`.

## 3.0.0-next.14

## 3.0.0-next.13

## 3.0.0-next.12

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – NEW `@embedpdf/angular/actions` entry: `injectActionsUiAdapter(handlers?)` — Angular's spelling of React's `useActionsUiAdapter` (the `inject*` law), installing the SHARED default policy from `@embedpdf/web` so the two bindings can never drift; re-exports the `@embedpdf/plugin-actions` contract. The parity gate goes green (`actions` ported; `anchored` consciously added to PENDING).

### Patch Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Route the Stage adapter's interaction dependency through the bundle-safe plugin contract entry instead of the interaction implementation root.

## 3.0.0-next.10

### Minor Changes

- [#788](https://github.com/embedpdf/embed-pdf-viewer/pull/788) by [@bobsingor](https://github.com/bobsingor) – Rename `EpdfPageContext.toPagePoint()` to `toContentPoint()` and align the
  Angular page context with the content-space page transform API.

## 3.0.0-next.9

## 3.0.0-next.8

## 3.0.0-next.7

### Minor Changes

- [#775](https://github.com/embedpdf/embed-pdf-viewer/pull/775) by [@bobsingor](https://github.com/bobsingor) – Move Angular Stage input handling to the shared web surface controller, with lens-scoped interaction and native touch pan, pinch, fling, double-tap, and long-press gestures. Interaction now defaults on when the hub is present and can be disabled for secondary lenses.

## 3.0.0-next.6

## 3.0.0-next.5

## 3.0.0-next.4

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the rebuilt Angular adapter for EmbedPDF v3. It provides reactive bindings, structural viewer and stage components, injectable capabilities, and headless feature layers through focused secondary entry points.
