# @embedpdf/vue

## 3.0.0-next.16

### Minor Changes

- [#876](https://github.com/embedpdf/embed-pdf-viewer/pull/876) by [@bobsingor](https://github.com/bobsingor) – Tapping a form field or editing a free text box on iOS no longer zooms the page in: their editors lay their text out at 16 px or more and draw it back at the page's size. `useRichTextEditor()`'s `style` now also makes your element fill its parent at that legible size, so draw the box's fill, border and padding on the parent: anything on the element itself scales with its text.

## 3.0.0-next.15

### Minor Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The page's layers say what they paint:
  - **`<RenderLayer>`** leaves out of the page picture what a layer on the page paints: the annotations while `<AnnotationLayer>` is there, the form fields while `<FormLayer>` is. Its `annotations` and `formFields` inputs decide for themselves when set; left out, a part no layer paints is drawn when the user may read it. Setting `annotations` to `false` next to an annotation layer is no longer needed.
  - **`<FormLayer>`** paints each field at rest as the engine draws it, in the state it shows, with the controls above while the tool fills forms. Hidden widgets get neither.
  - `canFill` and the signature checks take the field.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `@embedpdf/vue/history`: undo and redo (`useHistory`, `useHistoryState`, `useHistoryEvent`), with `historyPlugin` from `@embedpdf/plugin-history`.

  An annotation or a field that shows again before the page's next pictures arrive, such as one an undo brings back, shows its picture at once.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `<SelectionClipboard :target="area">` copies only while focus is inside that element (a template ref), for a page with more than one viewer, as `useCommandShortcuts({ target })` does for the other keys. Without `target` it copies anywhere on the page, as before.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `useSurfaceFocus(id, element, { select? })` puts the cursor in an element (a template ref) when the surface `id` asks for it (`open(id, { focus: true })`, or a command whose `panel` says `focus`), also when the element mounts while the request is up; `select` selects an input's text, so typing replaces it.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The form layer draws a widget with the painter (SVG text in the engine's own faces) while its look is pending or its picture is of an older version, and the engine's picture otherwise, taken from the form plugin: a typed value, a calculation or a restyle shows at once. The annotation layer applies the same rule, and takes its appearance scale from the render plugin: in design mode a form field being resized, or one restyled or newly placed, shows at once, drawn by the same painter. A scene's text is drawn in the faces its glyphs name, mounted while it shows. A text field's editor shows the text being typed where the engine will draw it, in the same face and size.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `useCommand(id)` always gives a command: an id no plugin registered comes back labelled with its id, neither visible nor enabled, the way a turned-off command does, and warns once in development with the closest id there is. A button checks `visible`, never `null`.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `useCommandShortcuts({ onRefused })` reports a key whose command is turned off or not allowed, with why; the key no longer reaches the browser. `<SelectionClipboard>` emits `refused` when Ctrl/Cmd+C or the browser's Copy meets a selection the user may not copy.

  The toolbar entry exports the bar vocabulary only: `ChromeSchema`, `FrameSchema`, `MenuSchema`, `MenuSection`, `chromeHelpers`, `defineChrome`, `validateChrome`, `addItem`, `removeItems` and `replaceItem` are gone with the chrome schema they edited. `custom(name)` without a command makes an item that never leaves the bar.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `<Toolbar orientation="vertical">` stands a toolbar on its side: it measures heights and fits the height it's given, stacks its sections top, middle and bottom, and draws every command at `'icon'`, with the default menus opening beside it. The toolbar is now a `role="toolbar"` with `aria-orientation` and an optional `aria-label` prop, and one tab stop: the arrow keys along it move between its items (the first focusable element of your own item is its stop), past disabled ones, with Home and End to the ends and Left and Right swapped in right-to-left text. The default "More", folded-group and group-trigger menus open on their first row and take the arrow keys, typeahead, Enter, and Escape, which closes the menu and puts focus back on its button; the toolbar drawing again while one is open leaves focus where it is. The measuring copies are `inert`. `separator-width` is the separator's thickness across the toolbar, and the `#custom` slot's `measure` takes a length: the item's height in a vertical toolbar.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `<KernelProvider :kernel>` in `@embedpdf/vue/runtime` gives its content a kernel someone else created and owns, so every composable inside works against it; it never starts or destroys the kernel, and reads it once. The full viewer's Vue wrapper uses it for the components you put in the viewer.

  `<Toolbar>`: a custom item your `#custom` slot draws nothing for in the `'measure'` layer, but draws in the `'live'` one, is measured where it renders, by the length it reports with `measure`. The hidden measurement layer no longer holds the item's command for it, so the two lengths no longer compete.

  The development warnings stay out of a production build. The check read `typeof process` first, which no bundler replaces and a browser doesn't have, so a production build of an app (with Vite, say) counted as development and showed the warnings to its users. It now reads `process.env.NODE_ENV`, which the bundler replaces, and counts as development only on a page with no bundler at all.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – A state composable whose plugin loads its state on demand (`useMetadataState()`) loads it once a ready document is in scope, for every document it reads, and shows `'loading'` until it's there.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Add `@embedpdf/vue/annotation`, the Vue view of the annotation plugin.
  - `<AnnotationLayer>` draws a page's annotations, the selection's outline and handles, the tool's preview and the text boxes being typed in. `:renderers` draws some annotations with your own components: each gets `annotation`, `frame`, `native` (the layer's own drawing, drawn with `<component :is="native" />`), `appearance`, `hovered`, `selected` and `interactive` as props. An `interactive` renderer takes the pointer, so its buttons can be clicked; one that only draws stays out of the pointer's way. The `#handle` and `#rotation-handle` slots draw the handles your way, while the viewer still decides where they can be grabbed.
  - `<AnnotationMenu>`, `<AnnotationDraftMenu>` (its slot gets the shape being drawn as `draft`) and `<AnnotationRotationBadge>` float your UI over the selection, a polygon in progress and a turn, in the Stage's `#overlay` slot.
  - `useAnnotation()`, `useAnnotationState()`, `useAnnotationSettings()` and `useAnnotationEvent()`; `useAnnotationList(filter?)`, `useAnnotationDefaults(toolId)`, `useAnnotationProperties(toolId?)` and `useAnnotationAnchor(ref)` are refs that take a getter for an argument that changes.
  - `useComments()`, `useCommentThreads()` and `useCommentThread(ref)`: the comments API and the threads with their page's index and label, as refs.
  - `useRichTextEditor(annotation)` makes your own element a text box's editor, inside a renderer: `ref` goes on the element as `:ref`, and `style` and `editing` are refs. It can be focused and typed in while the text box is being edited.
  - `useFilePickerProvider(provider?)` installs the file dialog behind the stamp and file attachment tools while the component lives.

  The entry re-exports the plugin, so `annotationPlugin()` comes from the same import as `<AnnotationLayer>`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Add the document entry points to `@embedpdf/vue`: `view-manager`, `page-edit`, `metadata` and `actions`.
  - `@embedpdf/vue/view-manager`: `useViewManager()`, `useViewManagerState()` (`panes` and `focusedPaneId` as refs) and `useViewManagerEvent()`, for panes that each hold their own tabs; wrap a pane's body in `<DocumentScope :id="pane.activeDocumentId">`.
  - `@embedpdf/vue/page-edit`: `usePageEdit()`, to rotate, move, insert, duplicate, delete and extract pages of the document in scope.
  - `@embedpdf/vue/metadata`: `useMetadata()`, `useMetadataState()` (`metadata`, `custom` and `status` as refs) and `useMetadataEvent()`.
  - `@embedpdf/vue/actions`: `useActions()`, `useActionsSettings()`, `useActionsEvent()` and `useActionsUiAdapter()`, which installs the browser's defaults for opening websites, printing and alerts for as long as the component lives. Its handlers can be a plain object, a ref or a getter; they are read each time an action needs one, so changing them never installs the adapter again.

  Each entry re-exports its plugin, so `metadataPlugin()` comes from the same import as `useMetadata()`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Add the form and signature entry points to `@embedpdf/vue`.
  - `@embedpdf/vue/form`: `<FormLayer>` goes in the Stage's `#page` slot and puts a real HTML control over each field of its page while the active tool fills forms: an editor in the field's own font for a text box (Enter or leaving the field commits, Escape puts the value back), the field's picture as a checkbox or radio button, an invisible native dropdown, a visible native list box that keeps its scroll position while a choice is written, a click target for a push button, and "sign here" for a signature field with the signature plugin. A press on a field stays out of the page below it and still runs the field's PDF actions, and the focus ring and the edge of a field without a border take their colors from the form settings (`--epdf-form-*` CSS variables win). `useForm()`, `useFormState()` (`fields`, `status`, `formKind` and `selectedField` as refs), `useFormSettings()` and `useFormEvent()`; `useFormValue(ref)` is one field's value as a ref that updates only when that field changes, and takes a getter to follow a prop.
  - `@embedpdf/vue/signature`: `useSignature()`, `useSignatureState()` (`signatures`, `target`, `busy` and the rest as refs), `useSignatureSettings()` and `useSignatureEvent()`. `useSignerRows()` is the people whose marks the stamp plugin holds, each with their signatures and initials, as a ref. The signers (`personalSigner` with `indexedDbKeyStore`, `webCryptoSigner`, `remoteSigner`, `createTestSigner`) come from the same import.

  Each entry re-exports its plugin, so `formPlugin()` comes from the same import as `<FormLayer>`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Add `@embedpdf/vue`, the Vue 3 adapter, with one entry point per feature: `runtime`, `stage`, `render`, `interaction` and `anchored`.
  - `@embedpdf/vue/runtime`: `<Viewer>` creates the kernel when it mounts and destroys it when it unmounts (`:engine`, `:plugins`, `:initial-documents`, the `:identity`, `:scope`, `:accent` and `:page` settings, `@ready`, and `#fallback` and `#error` slots). `<DocumentGate>` renders its content while the document is ready, with `#fallback`, `#locked` and `#error` slots, and `<DocumentScope :id>` binds a subtree to one document. `useDocuments()`, `useDocument()`, `useDocumentsState()`, `useDocumentsEvent()`, `usePageList()` and `useViewerSettings()` read the documents as refs, and `usePage()` gives a layer its page.
  - `@embedpdf/vue/stage`: `<Stage>` with `#page`, `#page-chrome` and `#overlay` slots, `v-model:page`, `v-model:zoom` and `v-model:tool`, a second view through `:token` or `<StageScope>`, `<Scrollbar>`, and `useStage()`, `useStageState()`, `useStageSettings()`, `useStageEvent()` and `useScrollMetrics()`.
  - `@embedpdf/vue/render`: `<RenderLayer>` (`:annotations`, `:tiles`), `useRender()`, `useRenderSettings()` and `useRenderEvent()`.
  - `@embedpdf/vue/interaction`: `<PagePointerSource>`, `useInteraction()`, `useInteractionState()`, `useInteractionSettings()`, `useInteractionEvent()` and `useToolCursor()`.
  - `@embedpdf/vue/anchored`: `<Anchored>` places UI next to a box on a page, in the Stage's `#overlay` slot.

  A plugin's composable returns an object that always calls the capability of the document in scope, so it is safe to keep in a closure; before a document opens its methods throw `not-ready`, and its settings calls work. State composables return one ref per field, or one ref for the value a selector picks, and update only when that value changes. An argument that can change takes a ref or a getter.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Add the stamp, measurement and redaction entry points to `@embedpdf/vue`.
  - `@embedpdf/vue/stamp`: `useStamp()`, `useStampState()` (`armedAsset` as a ref), `useStampSettings()` and `useStampEvent()`. `useStampLibraries(filter?)` and `useStampAssets(filter?)` are the libraries and their stamps as refs, and take a getter for a filter that changes (`useStampAssets(() => ({ libraryId: props.libraryId }))`). `useStampAssetPreviewUrl(assetId)` is an image URL for a stamp's preview, as a ref, revoked when the asset changes or the component unmounts. `indexedDbByteStore` keeps libraries in the browser between visits, with `persistStampLibraries` and `restoreStampLibraries`.
  - `@embedpdf/vue/measurement`: `useMeasurement()`, `useMeasurementState()`, `useMeasurementSettings()` and `useMeasurementEvent()`. `usePageScale(page)` is a page's scale as a ref (`null` for a `null` page), and `useMeasurementReadout(ref)` a measurement's `{ kind, value, label }`; both take a getter to follow a prop.
  - `@embedpdf/vue/redaction`: `useRedaction()`, `useRedactionState()` (`pendingCount`, `applying` and `lastResult` as refs), `useRedactionSettings()` and `useRedactionEvent()`. `usePendingRedactions(filter?)` is the marks waiting to be applied, or one page's, as a ref.

  Each entry re-exports its plugin, so `stampPlugin()` comes from the same import as `useStamp()`. Every composable works before a document opens.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Add the entry points for your app's own UI: `commands`, `toolbar`, `shell` and `i18n`.
  - `@embedpdf/vue/commands`: `standardCommands`, `useCommands()`, `useCommandsEvent()`, `useCommandsSettings()` and `formatShortcut()`. `useCommand(id)` is a command as a button needs it, as a ref (its label, icon, state, `run` for the component's document and its formatted `shortcut`), and takes a getter for an id that changes. `useCommandShortcuts()` turns every shortcut into a working key while the component lives, or only while focus is inside `target`, a template ref.
  - `@embedpdf/vue/toolbar`: `<Toolbar :bar>` fits a bar into the width it has (labels become icons, groups fold, the rest goes into a "More" menu) and you draw every part through its slots: `#command`, `#custom` (your own items, by `name`), `#collapsed`, `#group-trigger`, `#separator`, `#overflow-trigger` and `#overflow-menu`, each with a plain default. A slot that draws nothing for a part leaves it to the default. `useStripView(bar)` is a bar's visible commands as a ref, for a strip that doesn't fit itself; the schema helpers (`group`, `item`, `custom`, …) come from the same import.
  - `@embedpdf/vue/shell`: `useShell()`, `useShellState()`, `useShellEvent()`, and `useSurface(id)`, one panel's `isOpen` and `props` as refs with its `open`, `close` and `toggle`; closed, with verbs that do nothing, while no document is open.
  - `@embedpdf/vue/i18n`: `useI18n()`, `useI18nState()`, `useI18nSettings()`, `useI18nEvent()`, and `useT()`, a translate function that reads the language reactively, so a template or a computed that calls it updates when the language changes.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Add the viewing and text entry points to `@embedpdf/vue`: `page-view`, `selection`, `search` and `link`.
  - `@embedpdf/vue/page-view`: `<PageView :page :width>` shows one page without a Stage, by its ref or its index, with every layer working as it does on the Stage (`:document-id`, `:page-frame`, a `#fallback` slot until the page exists, a `#page-chrome` slot for the reserved frame; `class` and `style` go on the outer box). A menu anchored to the page is placed on the window, so a card or a scrolling list can't cut it off.
  - `@embedpdf/vue/selection`: `<SelectionLayer>` paints the selected text, `<SelectionMenu>` floats your content over it once it settles (`placement`, `:gap`), `<SelectionHandles>` draws the grips touch screens need in the Stage's `#overlay` slot, and `<SelectionClipboard>` wires Ctrl+C / Cmd+C (`:prefetch`). `useSelection()`, `useSelectionState()`, `useSelectionSettings()`, `useSelectionEvent()` and `copySelection` come from the same import.
  - `@embedpdf/vue/search`: `<SearchLayer>` paints the matches on a page; with `@hit-click` they take clicks, told apart from a drag that starts on one. `useSearch()`, `useSearchState()`, `useSearchSettings()`, `useSearchEvent()` and `useSearchHits()`, which takes a page (or a getter of one) for one page's matches.
  - `@embedpdf/vue/link`: `<LinkLayer>` makes a page's links clickable while a navigation tool is active, with a `#link="{ link, native }"` slot to draw them yourself (`<component :is="native" />` keeps what a click does). `useLink()` follows links from code and opens websites while a component uses it; `useLinkEvent()` follows the plugin's events.

  Each entry re-exports its plugin, so `searchPlugin()` comes from the same import as `<SearchLayer>`.

  A `<PageView>` shows the document its `<DocumentScope>` names (else the active one), and with the interaction plugin registered it is the page's pointer surface by itself, below its layers.

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The annotation, form, measurement and signature composables use the shared implementations in `@embedpdf/web` and the plugins; nothing they do changes. `SignerRow` is the signature plugin's own type now (the same fields, read-only).

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A read on a plugin's API now updates where it's called: a method named `get*`, `list*`, `is*`, `has*` or `can*` called in a template, a `computed` or a `watchEffect` follows its answer (`v-if="annotation.canCreate()"`), and every other method tracks nothing, as in every adapter.

  Without a document, a method that returns a promise (`form.setValue`, `redaction.markPage`) now returns a rejected promise with `not-ready`, so `.catch()` sees it; other methods still throw.

  The page context, the Stage's page layout and projector, the page view's transform, the page pointer listener, the scrollbar's geometry and presses, the tool cursors, anchored UI's measuring and the tile demand comparison now come from `@embedpdf/web`, `@embedpdf/core` and the plugins, shared with every framework.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The toolbar, commands, search, selection and link bindings use the shared implementations in `@embedpdf/core-ui`, `@embedpdf/web` and the plugins; nothing they do changes. `BoundCommand` comes from `@embedpdf/plugin-commands` (the same fields), and the toolbar's view types are aliases of core-ui's.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The toolbar's default "More" menu no longer lays an invisible backdrop over the whole page: it closes on a press anywhere outside it and its button.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Fix what `@embedpdf/vue` gives an app that installs it from npm. A `require` now finds CommonJS types (a `.d.cts` next to each `.cjs`); before, its types were read as ES modules, so a CommonJS project's imports were typed wrong. The declarations' own imports name their files (`./stage/scope.js`), so TypeScript's `node16` and `nodenext` resolution can follow them; before, every entry but `page-edit` failed there. `useRedactionState()` and `useSignatureState()` no longer name a package `@embedpdf/vue` doesn't depend on in their types (the engine's), which a strict installer like pnpm doesn't link.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `<RenderLayer>`'s tiles follow zooms and scrolls again. The tile plane released its page whenever the page context changed (every zoom), right after sending the new demand, so the render plugin forgot the page and its tiles went. The page's claim and the view's handle now follow the page and the view only; a camera move just sends a new demand.
