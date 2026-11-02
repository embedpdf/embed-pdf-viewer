# @embedpdf/react

## 3.0.0-next.20

### Minor Changes

- [#941](https://github.com/embedpdf/embed-pdf-viewer/pull/941) by [@bobsingor](https://github.com/bobsingor) – Add `@embedpdf/react/fonts`: `fontsPlugin`, `useFonts()`, `useFontsState()`, `useFontsEvent()` and `useFontMounts()`. Free text boxes and text fields mount the font programs their text is drawn in, so typed text shows in the program the engine writes with.

  Scene shapes apply their whole `style`, not only a blend mode, so form text draws as runs.

  The viewer's kernel measures text with the browser (`browserTextMeasurer()`), so a form field's text draws in the fonts the engine writes it in before the engine's picture arrives. A text field's editor draws again once its fonts are found.

- [#941](https://github.com/embedpdf/embed-pdf-viewer/pull/941) by [@bobsingor](https://github.com/bobsingor) – `useFontCss(font)` from `/fonts`: the CSS to draw text in a font as the engine draws it, again once its programs reach the browser, with the programs mounted while the component lives.

- [#941](https://github.com/embedpdf/embed-pdf-viewer/pull/941) by [@bobsingor](https://github.com/bobsingor) – A list box draws its rows in the widget's font, as the engine picks it, its programs mounted. `mountWebFont` is no longer exported from `/runtime`.

- [#939](https://github.com/embedpdf/embed-pdf-viewer/pull/939) by [@bobsingor](https://github.com/bobsingor) – `usePictureState()` gives a layer of a page whether that page's picture is on screen in its view: `{ status, slow }`, from the render plugin's `getPictureState`. Show a loading indicator while `status` is `'loading'` and `slow` is true. `<RenderLayer>` reports its page `loading` until its whole-page picture is on screen, and a render that fails; the box it lends a plugin that paints the pictures hands that plugin the page's report.

- [#936](https://github.com/embedpdf/embed-pdf-viewer/pull/936) by [@bobsingor](https://github.com/bobsingor) – `<RenderLayer>` lends its box to the plugin that paints its view's pictures (`handOverPictures` in the render plugin): it calls the painter's `paint` once per page, `update` as the page moves, and `destroy` when the page goes or the pictures are given back, and fetches no picture of its own meanwhile.

- [#931](https://github.com/embedpdf/embed-pdf-viewer/pull/931) by [@bobsingor](https://github.com/bobsingor) – `<RenderLayer thumbnail />` draws the page's thumbnail instead of its full picture: one small picture of the whole page, without tiles, which needs only `doc.render.thumbnail`. Use it in a strip of thumbnails or a page picker, so they show for sessions that may have thumbnails but not render pages.

### Patch Changes

- [#942](https://github.com/embedpdf/embed-pdf-viewer/pull/942) by [@bobsingor](https://github.com/bobsingor) – `<FormLayer>` fields take the form's cursor: `focus()` and `focusNext()` put it in them, Tab and Shift+Tab move through the fields in the document's order across pages that aren't on screen, and the arrow keys move between a radio group's buttons.

## 3.0.0-next.19

### Minor Changes

- [#920](https://github.com/embedpdf/embed-pdf-viewer/pull/920) by [@bobsingor](https://github.com/bobsingor) – The Stage draws the `zoom` tool's box while you drag, dashed in the accent color (the stage's `zoomBox` setting, or the `--epdf-zoom-box-*` variables). With interaction on, it registers the tool's handler for its own view only.

- [#923](https://github.com/embedpdf/embed-pdf-viewer/pull/923) by [@bobsingor](https://github.com/bobsingor) – `<Viewer fetch>`: your own `fetch` for documents at a URL, to add headers or cookies. Each download calls the latest prop.

## 3.0.0-next.18

## 3.0.0-next.17

### Patch Changes

- [#902](https://github.com/embedpdf/embed-pdf-viewer/pull/902) by [@bobsingor](https://github.com/bobsingor) – The state hooks' published types name each plugin's state type (`useFormState: StateHook<FormState>`) instead of spelling out its fields. The declarations no longer carry a copy of engine types, which they did on some builds, from 34 kB to 229 kB with zod's types inside.

## 3.0.0-next.16

### Minor Changes

- [#891](https://github.com/embedpdf/embed-pdf-viewer/pull/891) by [@bobsingor](https://github.com/bobsingor) – New entry `@embedpdf/react/attachment`: `useAttachment()`, `useAttachmentState()` (the files, the load state, `canAdd`, `canDownload`) and `useAttachmentEvent()` for `@embedpdf/plugin-attachment`. Reading the state reads the document's attachments.

- [#885](https://github.com/embedpdf/embed-pdf-viewer/pull/885) by [@bobsingor](https://github.com/bobsingor) – `@embedpdf/react/outline`: `useOutline()`, `useOutlineState()` and `useOutlineEvent()` for the document's outline (its bookmarks), with the plugin and its types. Reading the state reads the outline.

- [#876](https://github.com/embedpdf/embed-pdf-viewer/pull/876) by [@bobsingor](https://github.com/bobsingor) – Tapping a form field or editing a free text box on iOS no longer zooms the page in: their editors lay their text out at 16 px or more and draw it back at the page's size. `useRichTextEditor()`'s `style` now also makes your element fill its parent at that legible size, so draw the box's fill, border and padding on the parent: anything on the element itself scales with its text.

- [#890](https://github.com/embedpdf/embed-pdf-viewer/pull/890) by [@bobsingor](https://github.com/bobsingor) – `usePageEditState()` returns the page edits' state: `selected`, `canEdit` and `canExtract`. It takes a selector. Page-edit positions are `position` now, in place of `placement`.

### Patch Changes

- [#883](https://github.com/embedpdf/embed-pdf-viewer/pull/883) by [@bobsingor](https://github.com/bobsingor) – The runtime hands the kernel the browser's printer (`browserPrinter()` from `@embedpdf/web`), so `documents.print()` and `preparePrint()` print.

- [#895](https://github.com/embedpdf/embed-pdf-viewer/pull/895) by [@bobsingor](https://github.com/bobsingor) – A renderer that draws free text itself with `useRichTextEditor()` shows the text of every text box, including the ones saved in the PDF. Before, a saved box that wasn't being edited drew empty until it was double-clicked.

## 3.0.0-next.15

### Minor Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `/annotation` has the four hooks every plugin has: `useAnnotation()`, `useAnnotationState()` (`status`, `selected`, `hovered`, `editing`), `useAnnotationEvent()` and `useAnnotationSettings()`. `useAnnotationList(filter)`, `useAnnotationDefaults(id)` (was `useToolDefaults`), `useAnnotationProperties(toolId?)` (was `useSelectionFields`, `useToolFields` and `useSelectionFlags`), `useAnnotationAnchor(ref)` and `useRichTextEditor(annotation, page)` are new; `useAnnotationSelection`, `useAnnotationSelected`, `useAnnotationStatus` and `useAnnotationRotation` are gone. `AnnotationMenu`, `AnnotationDraftMenu` and `AnnotationRotationBadge` come from `/annotation` (the `/annotation-menu` entry is gone); the menu hides while the selection is dragged, and the badge shows the angle in the `chrome.readout` colors without children.

  Renderers get the annotation: `for(annotation)`, and the component's props are `{ annotation, box, page, native, appearance, hovered, interactive }`; `interactive` takes a function of `{ annotation, toolId }`. `<AnnotationLayer components={{ Handle, RotationHandle }}>` draws your own handles. Every chrome color, width and dash paints through its `--epdf-annotation-*` variable, and follows the viewer's accent unless `chrome.accent` is set.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The `Geom` type is no longer re-exported from `@embedpdf/react/annotation`; use the public `AnnotationGeometry`. The armed stamp's ghost follows `getArmedStamp()`. `usePages()` returns `previous` instead of `prev`. `useMeasurement()` no longer returns `canCalibratePage` (it was the document-wide `canCalibrate()`); read the permission with `useSelector(MeasurementToken, (measurement) => measurement.canCalibrate())`, like every other plugin's permissions. Typing in a free-text box shows at once and is written to the engine once after a pause in typing (or when the edit ends) instead of once per keystroke.

  React annotation and stage components use the engine's shape-specific fields and page-space transforms for live text, callouts, geometry, and navigation. Hooks and exports align with the revised form, search, metadata, and page-reference contracts.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `@embedpdf/react/commands` exports `standardCommands`, `useCommandsSettings()` and `formatShortcut()`, and `useCommand(id)` gives a bound `run` and a `shortcut` formatted for the platform. `useCommandShortcuts()` leaves a key alone when its command can't run, so the browser's own shortcut still works. `@embedpdf/react/i18n` has `useI18nState()` (`{ locale, direction, locales, loading }`) and `useI18nSettings()`; `useLocale()` is gone. `@embedpdf/react/runtime` exports `epdfTheme({ accent, … })`, a theme written with setting names as a style. `@embedpdf/react/toolbar` exports the toolbar's vocabulary only (the shortcut helpers moved to `/commands`), its default parts take their colors from `--epdf-toolbar-*`, the default button shows the command's label, and a render prop that returns `undefined` leaves the part to the default.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Follows the documents, interaction and stage contracts: `useDocuments` exposes `getActiveId`, `retry`, `rename`, `save`/`saveLayer`; new `useDocumentEvent`. Stage hooks read through `getSettings` and the page registry (`usePages().pageCount`, `usePageList().pages` come from `documents.listPages`); `useScrollMetrics`, `<Scrollbar>` and `<Stage>` bind the host lens. The actions adapter navigates with `goToPageIndex`. `SelectionLayer`, `SelectionMenu` and `SelectionHandles` follow the selection contract (`listSegments`, `getAnchor`, `isGestureActive`, `ensureLoaded`); the annotation-side anchor type is `AnnotationSelectionAnchor`. `RenderLayer` binds the render host lens: `renderSource`/`getSourceKey` for the base plane and a `ViewDemand` (`setDemand` in a layout effect, pure `getPlan`) for the tile plane. The annotation surface follows the annotation contract: `useAnnotationSelection` returns refs, `useAnnotationStatus` (was `useCommentsHydration`) returns a `ResourceStatus`, `useFilePickerProvider` uses the provider's remover, the menu anchors through `getSelectionAnchor`, and the text editor drafts through the host lens. The form surface follows the form contract: fill items address fields by `fieldRef`, `useFormField` resolves through `getFieldForWidget`, the fill layer binds the host lens (re-exported as `FormHostToken`). `LinkLayer` follows the link contract (`listLinks`, `ensureLoaded`, `getLabel`, the host `isNavigationEngaged`). The stamp hooks follow the stamp contract (`listLibraries`, `listAssets`, `getAssetPreview`). `useViews` is `usePanes` (`panes`, `focusedPaneId`, pane and tab verbs per the view-manager contract); `useSurface` and `useMenus` read through `getSurface` and `listOpenMenus`. Phase 4 (cross-cutting): `StageScope` and token-free stage hooks and chrome (`<Stage>` scopes its own pages and overlay), `useStageEvent`; the controlled `<Stage tool onToolChange>`, `useTool` gains `push`/`pop`, `useToolChanged`; a `use<Plugin>Event(pick, handler)` per plugin with events, plus `useInteraction`, `useRender`, `useActions`, `useViewManager`; `useSelectionState`, `useAnnotationList`, `useFormValue`, `useCalibrationRequest`; `useRedaction().lastResult` (was `lastApplyResult`) and `usePendingRedactions(filter?)`; `Viewer` forwards a kernel `ref` and takes `onReady`; development-only warnings for a `RenderLayer` that still bakes annotations under an `AnnotationLayer`, a `FormLayer` beside `formWidgetRenderer`, an inline `renderers` array, a second `useFilePickerProvider`, and `SelectionHandles` outside a stage; `<PageView>` takes `pageRef` or `pageIndex` (was `page`) and a `fallback`; `<SearchLayer onHitClick>`; the root barrel re-exports the form, search, i18n and actions entries in full.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The documents follow the four-hook pattern. `useDocuments()` is the documents API only, the in-scope view inside a `<DocumentScope>`, so `download()` without an id downloads the document in scope. `useDocument(select?)` gives the document a component talks to, with `hasUnsavedChanges`; `useDocumentsState(select?)` gives `{ documents, activeId }`; `useDocumentsEvent(pick, handler)` replaces `useDocumentEvent` and no longer subscribes again for an inline selector. `useDocumentStatus()` is gone: read `useDocument().status`.

  `<DocumentGate>` takes `locked={(document) => …}` and `error={(document) => …}`, each given the document, and shows `fallback` otherwise until the document is ready. `usePageList()` is in `/runtime`, needs no Stage and returns the document's pages as an array.

  `<Viewer>` takes `identity` and `scope`, the defaults for every document it opens (a document's own replace them; documents opened after a change use the new values), and `accent` and `page { background, shadow }`, which the Stage and `<PageView>` paint pages with through the `--epdf-page-*` variables. `useViewerSettings(select?)` reads them. `children` is optional.

  The view manager's entry is `/view-manager` (was `/views`): `useViewManager()`, `useViewManagerState(select?)` (`{ panes, focusedPaneId }`) and `useViewManagerEvent()`; `usePanes()` is gone. `saveFile` and `mountWebFont` are exported from `/runtime`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The page's layers say what they paint:
  - **`<RenderLayer>`** leaves out of the page picture what a layer on the page paints: the annotations while `<AnnotationLayer>` is there, the form fields while `<FormLayer>` is. Its `annotations` and `formFields` inputs decide for themselves when set; left out, a part no layer paints is drawn when the user may read it. Setting `annotations` to `false` next to an annotation layer is no longer needed.
  - **`<FormLayer>`** paints each field at rest as the engine draws it, in the state it shows, with the controls above while the tool fills forms. Hidden widgets get neither.
  - `canFill` and the signature checks take the field.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `useCommandShortcuts({ target })` binds the shortcuts to one element (a ref) instead of the whole window, so a page with several viewers, or a viewer inside a larger app, only reacts while that element has focus.

  The text selection layer and its handles follow the viewer's `accent` setting instead of a fixed color.

  A capability stand-in's settings calls refuse with `not-ready` while the plugin is still loading, instead of throwing.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `/form`: `<FormLayer>` is the one way to fill forms, with or without the annotation plugin: it puts real controls over the fields' own pictures (the page raster, or the `<AnnotationLayer>` while the form plugin keeps widgets inert), and draws its focus ring, the edge of a field without a border and the editor in the form settings' colors, through the `--epdf-form-*` CSS variables. `formWidgetRenderer` and the `FormHostToken` export are gone, and so is `<AnnotationLayer renderers={[formWidgetRenderer]}>`. `useForm()` is the public capability; `useFormState()` (`fields`, `status`, `formKind`, `selectedField`) and `useFormSettings()` replace `useFormSnapshot()` and `useFormField()`; `useFormValue(ref)` reads empty without a document. `toFieldRef` comes from `/form`.

  `/signature`: `useSignatureState()` (`signatures` with their verdicts, `protection`, `target`, `busy`, `pending`, `status`) and `useSignatureSettings()` replace `useSignatureSnapshot()`, `useSignatureVerdicts()`, `useDocumentProtection()` and `useSignatureTarget()`.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – New `KernelProvider` in `@embedpdf/react/runtime`: gives a subtree a kernel that was created elsewhere, such as the full viewer's, so every hook in it reads that kernel. It never starts or destroys the kernel.

  The toolbar's default "More" menu no longer lays an invisible backdrop over the whole page: it closes on a press anywhere outside it and its button.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `@embedpdf/react/history`: undo and redo (`useHistory`, `useHistoryState`, `useHistoryEvent`), with `historyPlugin` from `@embedpdf/plugin-history`.

  An annotation or a field that shows again before the page's next pictures arrive, such as one an undo brings back, shows its picture at once.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `useInteractionState()` returns `{ activeToolId, tools }`, built from the plugin's `interactionState` declaration: it takes a selector, and without a document `activeToolId` is `null` and `tools` is empty. `useInteractionSettings()` returns the interaction settings, with or without a document. `useTool()` and `useToolChanged()` are gone: use `useInteraction()` for the verbs, `useInteractionState()` for the state and `useInteractionEvent((interaction) => interaction.onToolChanged, handler)` for the event. `svgCursor` and `SvgCursorOptions` are exported from `/interaction`.

  `useShellState()` returns `{ openSurfaces, openMenus }` and works without a document; `useMenus()` is gone. `useSurface(id).props` is an empty object for a surface opened without props.

  `<Anchored>` flips to the other side of its box when the side you chose has no room, and stays inside the view, `gap` pixels from its edges, while the box is in view. It measures its content once it renders, and again when the content or the view changes size. An `anchor` without `bounds`, such as a search match with no geometry, hides it, as `null` does.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `<SelectionClipboard target={ref}>` copies only while focus is inside that element, for a page with more than one viewer, as `useCommandShortcuts({ target })` does for the other keys. Without `target` it copies anywhere on the page, as before.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `useSurfaceFocus(id, ref, { select? })` puts the cursor in `ref`'s element when the surface `id` asks for it (`open(id, { focus: true })`, or a command whose `panel` says `focus`), also when the element mounts while the request is up; `select` selects an input's text, so typing replaces it.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – The page context exposes `ref: PageRef` (identity-stable per page) instead of `pon`; `usePageList()` entries carry `ref`, selection and annotation anchors carry `page`, and `usePageScale` accepts a `PageRef` or `null`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `usePageEdit()` is the page edit capability (was `usePageEditor()`). `useMetadata()` is the metadata capability, and `useMetadataState()` returns `metadata`, `custom` and `status`, takes a selector, and returns the empty state without a document; `useCustomMetadata()` is gone. `useActionsSettings()` returns the actions settings, with or without a document.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The form layer draws a widget with the painter (SVG text in the engine's own faces) while its look is pending or its picture is of an older version, and the engine's picture otherwise, taken from the form plugin: a typed value, a calculation or a restyle shows at once. The annotation layer applies the same rule, and takes its appearance scale from the render plugin: in design mode a form field being resized, or one restyled or newly placed, shows at once, drawn by the same painter. A scene's text is drawn in the faces its glyphs name, mounted while it shows. A text field's editor shows the text being typed where the engine will draw it, in the same face and size.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – `useMetadata` returns `status` and `refresh`; `useSearchState` follows the new search getters; `SearchLayer` reads reference-stable per-page hits; new `useMetadataEvent` and `useSearchEvent`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `<Anchored>` takes `pinned`, the new start and end placements, and a negative `gap`, for badges and status that stay on their annotation. Anchored UI on a page that isn't on screen renders nothing and isn't rendered again while people scroll or zoom, and anchored UI out of view isn't drawn, so hundreds of them cost only the ones in view. `useAnnotationAnchor()` re-renders only when its annotation moves, not on every camera frame.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – An annotation renderer draws into a frame: the layer places, sizes and turns it exactly like the annotation's own drawing, also on a turned page and during a drag, a resize or a turn, and the component fills it. The layer's own drawing sits in the same frame, so a custom look and the native one can never disagree, and blending (a highlight's multiply) happens on the frame. A look is drawn at the annotation's 100% size and scaled with the page, text and borders included, as the PDF's own drawing is; `scale: false` on a renderer draws at the size on screen instead. Renderers get `frame` (`width` and `height` at the 100% size, its `rotation` on screen, and its `scale`) and `selected`, and `native` fills the frame; `box` and `page` are gone, and `appearance` is `{ url }`. A note drawn your way now stays upright on a turned page, like its icon. `useRichTextEditor(annotation)` reads the page it's on itself. `BehaviorRendererProps` is its own shape: a behavior renderer places its controls from `item` and `page`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `<SearchLayer>` paints matches in the search plugin's `highlight` setting, and the `--epdf-search-highlight`, `--epdf-search-highlight-active` and `--epdf-search-blend-mode` CSS variables win over it; its `color`, `activeColor` and `blendMode` props are gone. With `onHitClick`, only a click calls it: a press that travels 4 px (10 px for a finger) is a drag, which selects text, and the press always reaches the page.

  `useSearchState()` is built from the plugin's `searchState` declaration: it returns `activeHitIndex` (was `activeIndex`) and `activeHit`, takes a selector, and returns the empty state without a document. `useSearchHits(page?)` returns every match or one page's (a ref or an index), as the plugin's reference-stable arrays, and an empty list without a document or for a page that isn't in it. `useSearchSettings()` returns the search settings, with or without a document.

  `settingsHook(token)` turns any plugin's settings into a hook, `const useSearchSettings = settingsHook(SearchToken)`: it reads through `kernel.settingsOf`, so it works before the first document opens, takes a selector, and re-renders only when a setting changes. The stand-in `useSearch()` and other plugin hooks return without a document now forwards the four settings calls to the plugin's settings, so `updateSettings()` works before a document is open; every other method still throws `not-ready`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `<SelectionLayer>` paints the selected text in the selection plugin's `color` setting, and `<SelectionHandles>` paints its handles in the `handles` setting; the `--epdf-text-selection`, `--epdf-text-selection-handle` and `--epdf-text-selection-handle-shadow` CSS variables win over them. Unset, the selection is the viewer's accent at 35% and the handles the accent itself, following `--epdf-accent`. Their `color` props are gone.

  `useSelectionState()` is built from the plugin's `selectionState` declaration: it returns `hasSelection`, `isSelecting`, `range` and `pages` (was `pageRefs`), takes a selector, and returns the empty state without a document. `useSelectionSettings()` returns the selection settings, with or without a document.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `/stamp`, `/measurement` and `/redaction` have the four hooks every plugin has. `useStampState()` (`armedAsset`, for the document in scope), `useStampSettings()`, and `useStampAssets({ libraryId })` (was a bare id); `useArmStampAsset()` is gone: `useStamp().armAsset(assetId)` places on the document the component is in. `useMeasurement()` is the capability only, `useMeasurementState()` reads `busy`, `calibrationRequest` and `lastReports`, and `useMeasurementSettings()` the settings; `useCalibrationRequest()` is gone. `useRedaction()` is the capability only, `useRedactionState()` reads `pendingCount`, `applying` and `lastResult`, and `useRedactionSettings()` the settings. `usePageScale(page)`, `useMeasurementReadout(ref)` and `usePendingRedactions({ page })` take a page as a ref or an index, and read empty before a document opens.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `stateHook(declaration)` turns a state declaration from `defineState()` into a hook: `const useSearchState = stateHook(searchState)`. The hook returns the state of the document in scope (the nearest `<DocumentScope>`, else the active document), or the declaration's `empty` while that document isn't open or ready, so it renders anywhere. It takes an optional selector, `useSearchState((state) => state.hitCount)`, and re-renders only when a field of the state, or the selected value, changes.

  Plugin hooks such as `useSearch()` and `useShell()` no longer throw when no document is open. Until a document is ready they return a stand-in: rendering works, and calling one of its methods throws a `PluginError` with code `not-ready` ("no document is open"). The stand-in is the same object on every render. A plugin that isn't registered still throws, and `useSelector` still throws the kernel's reason without a document; `useOptionalSelector` and the state hooks are the ones to use in chrome that renders before the first document.

  `useToolCursor()` and `<SelectionClipboard>` work without a document: they install their cursor or wire the clipboard once a document is ready. Inside a `<DocumentScope>`, `useDocuments()` returns that document's verbs, so `save()` and `saveLayer()` without an id save the document in scope. `useDocumentScope()` returns the id the nearest `<DocumentScope>` binds, or `null` when the subtree follows the active document.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `<Toolbar>`: a `renderCustom` renderer that draws nothing (`null`) in the measurement layer is left out of it and measured where it renders, by the `ctx.measure` it reports to, instead of counting as 0 px wide.

  `useCommand(id)` always gives a command: an id no plugin registered comes back labelled with its id, neither visible nor enabled, the way a turned-off command does, and warns once in development with the closest id there is. A button checks `visible`, never `null`.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `<Toolbar orientation="vertical">` stands a toolbar on its side: it measures heights and fits the height it's given, stacks its sections top, middle and bottom, and draws every command at `'icon'`, with the default menus opening beside it. The toolbar is now a `role="toolbar"` with `aria-orientation` and an optional `aria-label`, and one tab stop: the arrow keys along it move between its items (the first focusable element of your own item is its stop), past disabled ones, with Home and End to the ends. The default "More", folded-group and group-trigger menus open on their first row and take the arrow keys, typeahead, Enter, and Escape, which closes the menu and puts focus back on its button. `@embedpdf/react/toolbar` no longer re-exports the chrome schema helpers `@embedpdf/core-ui` dropped (`chromeHelpers`, `addItem`, `removeItems`, `replaceItem`, `defineChrome`, `validateChrome` and their types).

  `useCommandShortcuts({ onRefused })` reports a key whose command is turned off or not allowed, with why; the key no longer reaches the browser. `<SelectionClipboard onRefused>` is called when Ctrl/Cmd+C or the browser's Copy meets a selection the user may not copy.

  Under React 19, a renderer that only draws (`<AnnotationLayer>`) and the toolbar's measuring copies are `inert` again: React 19 dropped the empty string they set it with.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `<Anchored>` says where it sits in `data-placement` on its wrapper: the `placement` asked for, or the opposite side once it flipped there for lack of room. What opens from anchored UI, such as a menu from a bar over a selection, can read it to open away from the box.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – A state hook whose plugin loads its state on demand (`useMetadataState()`) loads it once a ready document is in scope, for every document it reads, and shows `'loading'` until it's there.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The Stage has the four hooks every plugin has: `useStage()` (the API), `useStageState(select?, token?)` (the declared state, empty without a document), `useStageEvent()` and `useStageSettings(select?, token?)` (the view's settings). `useZoom`, `usePages`, `useLayout` and the Stage's `usePageList` are gone: read the state from `useStageState()`, change settings with `useStage().updateSettings()`, and get the pages from `usePageList()` in `/runtime`. `<Stage>` loses its `interaction`, `panFallback` and `zoomGestures` props, which are now the view's settings. `<Scrollbar>` and `useScrollMetrics()` come from `/stage` (the `/scrollbar` entry is gone); `useScrollMetrics()` reads zero without a document.

  `<PageView>` takes `page` (a ref or an index, was `pageRef`/`pageIndex`), `className`, and a `pageFrame` that names only the sides it reserves. `useRenderSettings()` reads the render settings, and `RenderLayer` follows them live. `<LinkLayer renderLink>` receives `{ link, native }` (was `{ item, nativeComponent }`); every click and key follows a link through `activate()`, so `onActivated` fires for a website too, and while a `LinkLayer` or `useLink()` is mounted, `activate()` from code opens a website. `openLinkTarget` is gone.

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The annotation, form, link, selection, search, page view, toolbar, stamp and command bindings now use the shared browser implementations in `@embedpdf/web`, with no change in behavior. `enrichCommentThreads`, `sameAnchor` and `sameCreationDraftAnchor` are no longer exported from `@embedpdf/react/annotation`: use `enrichCommentThreads`, `sameSelectionAnchor` and `sameCreationDraftAnchor` from `@embedpdf/web`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `<AnnotationLayer>`: an `interactive` renderer takes the pointer (its buttons and fields get clicks without CSS of their own), and a renderer that draws a text box with `useRichTextEditor()` can be typed in: its subtree stops being inert while the box is edited, and `editor.style` takes the pointer while typing.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Key annotation appearances and comment threads with `annotationKey`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `<AnnotationLayer>` draws again once its `interactive` renderers are registered, so such a renderer takes the pointer from the first frame after mount, not only after the next change on the page.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The annotation, form, measurement and signature hooks use the shared implementations in `@embedpdf/web` and the plugins; nothing they do changes. `SignerRow` is the signature plugin's own type now (the same fields, read-only).

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The page context, the Stage's page layout and projector, the page view's transform, the page pointer listener, the scrollbar's geometry and presses, the tool cursors and anchored UI's measuring now come from `@embedpdf/web`, and the no-document stand-in and the viewer's settings from `@embedpdf/core`, shared with every framework; nothing changes in how they behave. `makePageContext` and `PageContextValue` are the shared ones.

  Without a document, a method that returns a promise (`useForm().setValue`, `useRedaction().markPage`) now returns a rejected promise with `not-ready`, so `.catch()` sees it; other methods still throw.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – The toolbar, commands, search, selection and link bindings use the shared implementations in `@embedpdf/core-ui`, `@embedpdf/web` and the plugins; nothing they do changes. `BoundCommand` comes from `@embedpdf/plugin-commands` (the same fields), and the toolbar's view types are aliases of core-ui's.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Form text fields report what is being typed to the form plugin, so a download while someone types includes the text. A field is still written on blur or Enter, and Escape still discards what was typed.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `inert` takes effect under Preact too: the toolbar's measuring copy and an inert annotation's subtree were focusable there, because Preact sets `inert` as a property and the empty string read as false. In the viewer, the arrow keys skipped every toolbar item after the zoom field.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `<PageView>` without a `documentId` shows the document a `<DocumentScope>` around it names, like every other component, instead of always the active one. With the interaction plugin registered, a `<PageView>` is now the page's pointer surface by itself (below its layers, so links and form fields keep their presses), so text selection and annotation editing work in it without mounting `<PagePointerSource>` yourself.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A press on a link or a form field stops there: it no longer reaches the Stage below (where it started the active tool's gesture or ended an edit), and it reaches the PDF's own actions as "mouse down", which form fields never sent before. The link and form field components take the press through `isolatePointerDown` from `@embedpdf/web`, because React's own handlers run from the root, after the Stage has seen it.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Tool ghosts paint see-through as a whole, with the tool's opacity or `--epdf-ghost-opacity`, the armed stamp's image included.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The development warnings stay out of a production build. The check read `typeof process` first, which no bundler replaces and a browser doesn't have, so a production build of an app (with Vite, say) counted as development and showed the warnings to its users. It now reads `process.env.NODE_ENV`, which the bundler replaces, and counts as development only on a page with no bundler at all. `<Viewer>`'s warning about a changed engine or plugin list goes through the same check.

## 3.0.0-next.14

### Minor Changes

- [#827](https://github.com/embedpdf/embed-pdf-viewer/pull/827) by [@bobsingor](https://github.com/bobsingor) – Add the measurement feature entry with reactive calibration, page-scale, and readout hooks. Render rotated distance captions and use the standard square handles for measurement endpoints and leaders during annotation gestures.

## 3.0.0-next.13

### Minor Changes

- [#812](https://github.com/embedpdf/embed-pdf-viewer/pull/812) by [@bobsingor](https://github.com/bobsingor) – Add the `@embedpdf/react/signature` entry point with hooks for signing, signature
  snapshots, validation verdicts, protection, target fields, events, and saved
  signature libraries.

  Make signature widgets selectable for signing or inspection, and allow
  `useStampLibraries()` to filter libraries by kind. Use the stamp capability
  contract in signature hooks to preserve plugin dependency boundaries.

### Patch Changes

- [#817](https://github.com/embedpdf/embed-pdf-viewer/pull/817) by [@bobsingor](https://github.com/bobsingor) – Connect FreeText annotations to the shared rich-text editor so styled runs render and edit consistently, with text selections preserved during formatting. Paint annotation backgrounds only once to avoid doubling translucent fills.

## 3.0.0-next.12

### Minor Changes

- [#803](https://github.com/embedpdf/embed-pdf-viewer/pull/803) by [@bobsingor](https://github.com/bobsingor) – The stamp hover ghost is rendered at the on-screen device pixel size and re-requested when the zoom crosses a size bucket, so large vector stamps stay sharp. `@embedpdf/react/stamp` additionally re-exports `indexedDbByteStore` and `ByteStore` from `@embedpdf/web`, the browser store for `persistStampLibraries` / `restoreStampLibraries`.

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – New `@embedpdf/react/actions` entry with `useActionsUiAdapter` (browser-default URI open through `sanitizeExternalUri` + print dialog, overridable per handler), a `useCapabilityEvent` hook for capability event subscriptions, and link-layer delegation: chain-bearing URI links drop the native `href` fast path so the dispatcher runs the whole chain (the `'dispatched'` outcome opens nothing itself — the adapter owns it).

  Widget fill controls become always-active `/AA` event surfaces, link anchors feed link hover events, and scripting-provider defaults use the dispatch origin when deciding whether to suppress lifecycle/boot UI effects.

  Route sibling feature dependencies through plugin contract/helper entries. Annotation selection hooks and anchor equality helpers are split into leaf modules so form and annotation-menu entries no longer import the full annotation feature implementation.

  Render PDF list boxes as visible native scrolling controls in both form surfaces, with stable optimistic selection and wheel isolation so row hit-testing, selection, and scrolling stay synchronized while engine writes complete. Combo boxes retain their baked resting appearance and native popup behavior.

  Keep keyboard focus indicators above baked PDF appearances so checkboxes and choice controls display the same clear blue focus ring as text fields and radio buttons.

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – `useActionsUiAdapter` is the ONE script UI port: it gains `alert` and `gotoPage` defaults with the origin×phase visibility matrix (lifecycle/boot alerts and non-user print suppressed unless the embedder passes handlers — which receive everything, context attached). `useFormScriptingProvider` and `FormScriptingUiHandlers` are DELETED.

### Patch Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – `useActionsUiAdapter` is now glue over `@embedpdf/web`'s `createDefaultActionsUiAdapter` — behavior-identical (the corpus alert matrix pins it); the default policy lives in ONE place for every binding.

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Widget activation is a WIDGET behavior, not a push-button behavior: clicking ANY form widget now dispatches its `/A` through `form.activateWidget` — text, toggle, and choice widgets (both the annotation-backed renderers and the standalone fill layer) join the button path. This makes real-world "fake buttons" work: producers ship Reset/Next/Hide controls as READ-ONLY text fields carrying a widget `/A` (ISO puts the activate action on the annotation dictionary, any field type), which previously died in the viewer because only push buttons routed clicks to activation while the pointer feed's mouseUp was — correctly — shadowed by `/A` precedence. Disabled controls become pointer-transparent so their clicks reach the activation surface (a disabled form control suppresses click events entirely); toggles keep Acrobat's order (the value change first, THEN the `/A`); push buttons keep their gated door (`disabled` still blocks activation there). Proven end-to-end by a real-DOM regression test (rendered FormLayer over a real engine — the gap every prior `activateWidget()`-direct test masked) and a read-only fake-button fixture in the plugin e2e.

## 3.0.0-next.10

### Minor Changes

- [#788](https://github.com/embedpdf/embed-pdf-viewer/pull/788) by [@bobsingor](https://github.com/bobsingor) – Add comment-thread APIs with live page metadata and navigation rectangles.
  Align React page contexts with the content-space transform API, improve live
  free-text and callout rendering, and route link activation through the shared
  link-opening behavior.

## 3.0.0-next.9

## 3.0.0-next.8

### Patch Changes

- [#779](https://github.com/embedpdf/embed-pdf-viewer/pull/779) by [@bobsingor](https://github.com/bobsingor) – Bind Stage surface measurement before browser paint so the initial viewport and camera placement settle before page surfaces become visible. React viewers no longer show a transient incorrectly positioned page while a document opens.

## 3.0.0-next.7

### Minor Changes

- [#775](https://github.com/embedpdf/embed-pdf-viewer/pull/775) by [@bobsingor](https://github.com/bobsingor) – Move React Stage input handling to the shared web surface controller, key page surfaces by durable page identity, and add draggable touch selection handles. Interaction now defaults on when the hub is present and can be disabled for secondary lenses.

### Patch Changes

- [#776](https://github.com/embedpdf/embed-pdf-viewer/pull/776) by [@bobsingor](https://github.com/bobsingor) – Refactor `SelectionHandles` to use the shared selection and web primitives so handles align correctly with rotated text and rotated pages.

- [#777](https://github.com/embedpdf/embed-pdf-viewer/pull/777) by [@bobsingor](https://github.com/bobsingor) – Give every Stage lens and standalone `PageView` a stable view identity and use its scoped tile handle. Thumbnail and secondary views can no longer clear the main view's high-resolution tiles.

## 3.0.0-next.6

### Minor Changes

- [#768](https://github.com/embedpdf/embed-pdf-viewer/pull/768) by [@bobsingor](https://github.com/bobsingor) – Consolidate base-page and deep-zoom tile painting into `RenderLayer`, with a `tiles` option for lenses that explicitly disable tiling. The separate `TileLayer` surface is removed because tile engagement is now render-policy arithmetic owned by `RenderLayer`.

  Tiles are positioned directly in view-pixel space and use the shared painted-image lifecycle, keeping retained coverage until replacements have a presentation opportunity and avoiding deep-zoom rounding drift, incomplete-image outlines, and transient seams.

## 3.0.0-next.5

### Minor Changes

- [#759](https://github.com/embedpdf/embed-pdf-viewer/pull/759) by [@bobsingor](https://github.com/bobsingor) – Add a shared `Anchored` overlay primitive with same-commit Stage projection and measured PageView support. Annotation menus now use this common surface-aware path, replacing the separate PageView menu components, and new `SelectionMenu` and `SelectionClipboard` components provide settled text-selection actions and clipboard integration.

## 3.0.0-next.4

### Minor Changes

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Render search and selection highlights from canonical text segments. Axis-aligned lines retain their classic appearance, while rotated lines render their true oriented cells.

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Render live caret annotations with their text-baseline rotation.

  The React annotation painter now treats caret SVGs as box-family visuals, applying the caret's authoring rotation about its centre while continuing to leave vertex-geometry rotation advisory.

### Patch Changes

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Renders text-selection highlights from oriented segment polygons so the React selection layer follows rotated, sheared, and mirrored text.

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the rebuilt React adapter for EmbedPDF v3. It provides generic reactive bindings, structural viewer and stage components, hooks, and headless feature layers while leaving application UI composition fully under React's control.
