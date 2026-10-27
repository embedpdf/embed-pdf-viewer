# @embedpdf/web

## 3.0.0-next.17

## 3.0.0-next.16

### Minor Changes

- [#876](https://github.com/embedpdf/embed-pdf-viewer/pull/876) by [@bobsingor](https://github.com/bobsingor) – Editors on a page no longer make iOS Safari zoom the page in when they take focus. A text field's editor (`textFieldEditorStyleOf()`) and a free text box's editor lay their text out at 16 px or more and draw it back at the page's size with a transform, so they look the same in every browser. New: `freeTextBoxOf()`, the layer's own text box (its place on the plate, its turn and its style, in place of `textPlateInPixels()`); `ownTextBoxOf()`, your own element as a text box's editor, filling its parent; `legibleScaleOf()`, `legibleShrinkOf()`, `LEGIBLE_FONT_PX` and `textFieldFontPxOf()`. `textFieldStyleOf()` takes the legible scale. `textPlateInPixels()`, `TextPlatePixels` and the `textBoxStyleOf()` export are removed.

- [#883](https://github.com/embedpdf/embed-pdf-viewer/pull/883) by [@bobsingor](https://github.com/bobsingor) – Add `browserPrinter()`, the browser's print dialog for `createKernel({ printer })`. Where the browser's own PDF viewer prints PDFs (a desktop browser with it on), it prints the kernel's PDF copy from a hidden frame, keeping the frame until the next PDF so the browser can finish; a print the browser refuses rejects, so the kernel prints pictures instead. Everywhere else it prints pictures: one sheet per page, sized to the page with a named `@page`, from a hidden frame, or from the page itself on iOS, which prints a frame as a picture of the page around it. In Safari's engine it `needsTap`: Safari prints only from a tap (later, iOS refuses the print dialog and the Mac prints blank pages). `standardCommandsBrowser` no longer has `print`: printing goes through the kernel.

## 3.0.0-next.15

### Minor Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `epdfThemeVariables(theme)` turns a theme written with setting names (`{ accent, search: { highlight: { color } } }`) into the `--epdf-*` variables, typed from `EPDF_VARIABLES`. `bindCommandShortcuts()` and `isMacPlatform()` are the browser's part of command shortcuts.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – `StageSurfaceHost` and `StageGestureHost` follow the stage host contract: `setViewportSize`, `getPageAt`, `viewportToPage`, `isMoving`; `StageSurfaceHub` is `{ dispatchPointer, getActiveTool, wouldClaimTouch }`. `ClipboardSelectionSource` subscribes through `onChanged` / `onCommitted`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Add `EPDF_VARIABLES`, the list of every `--epdf-*` CSS variable that themes EmbedPDF: the setting each one overrides, the part its default follows (another part, or an accent), and its built-in value. `paint(name, settingValue)` gives the CSS value a painted part uses, so any variable wins over its setting: the part's own variable, then the variable of the part it follows, its plugin's accent variable such as `--epdf-annotation-accent`, and `--epdf-accent`, then the setting's value. The rotation handle follows the other handles, so `--epdf-annotation-handle-fill` and `--epdf-annotation-handle-stroke` reach it too. A dash style paints as a dash array (`'dashed'` is `4 3`). `mixAccent()` builds a translucent default such as "the accent at 35%" with `color-mix()`, so it follows the accent variables too, and `paintDefault()` gives the CSS value of a part you style yourself, which has no setting.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – What the layers on a page paint, and the form fields' pictures:
  - **`pageLayersOf(page.ref)`:** a layer says which part of the page it paints (`paint('annotations' | 'formFields')`), and the render layer reads `painted()`. `pictureLayerOptionsOf(painted, props, rights)` gives the picture's options, and `partsDrawnTwice` names what a prop draws twice.
  - **`loadFieldPictureUrls`** loads a page's field pictures, every state, and **`shownFieldPicture`** picks the one a widget shows.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) –
  - A text field keeps the typed text when it loses focus until the field shows it, so it never flashes the old value; a value the form's validation refuses stays typed, as in Acrobat. `TextFieldDrafts.commitDraftText()` resolves with how the write ended (`{ status }`) or `null`.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A layer's pictures stay valid until the next ones are shown: `createShownUrls()` makes one holder per layer, passed first to `loadAppearanceUrls(shown, …)` and `loadFieldPictureUrls(shown, …)`, and `release()`d when the layer goes. Cancelling a load drops only the URLs it hadn't shown, so a picture that shows again before the next set arrives (an annotation an undo brings back) is never a revoked URL. A load makes its URLs side by side, not one after another.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `fitAnchoredRect(box, placement, gap, { size, view })` places anchored UI of a known size: on the side asked for when it fits, else on the opposite side when that fits or has more room, then moved to stay inside the view while its box is in view. `projectAnchoredTarget()` takes the same `fit` as an optional last argument, and every `AnchoredPosition` says which `placement` it used. The stage surface reads a tool's `touch: 'draw'` where it read `touchDirect`.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `wireSelectionClipboard(selection, { target })` takes an element as well as a document. With an element, Ctrl/Cmd+C and Edit → Copy copy only while focus is inside it, so two viewers on a page never both copy and the page keeps its own copying. Whether the browser copies a live DOM selection itself is read from the element's shadow root or document.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `createSurfaceFocusFollower()` is the rule the surface-focus hooks share: an element takes focus when its surface's `focusRequest` changes to a new value above 0, and when it starts following while a request is up (a panel whose code loads on its first open); another document's shell starts over. `moveFocusInto(container, initialFocus?)` moves focus into a container unless it's there already, and `attachFocusTrap` uses it, so a field that took the cursor as its dialog opened keeps it. `containsFocus(container)` says whether focus is inside an element, through shadow roots and from a slotted element to its slot. `bindCommandShortcuts` passes `inTextField` to `matchStroke`, so a command that runs from text fields gets its key there.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – `AnchorTarget` and the `ViewProjector` methods identify pages with `page: PageRef`; the structural `PageRef` type is exported.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Annotation and form widget pictures load the same way: `loadAppearanceUrls` keys each picture by its item and state, with the version of its item it shows; `shownAppearance(urls, key, state)` picks the one an item shows, and `bakedAppearanceOf` takes the state. `loadFieldPictureUrls`, `shownFieldPicture` and `FieldPicture` are removed. `pictureOrPainting` is the one rule that picks an item's picture or its live drawing. `createFontMounts` holds the faces a layer mounted, `svgShapesOf` passes a `glyphs` node's font program on to its `text` shape, and `fontProgramsOf(shapes)` lists the faces shapes draw their text in, and `textFieldEditorStyleOf` takes the engine's layout of the text being typed (`TextEditorLayout`).

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Anchored placement lines up with a side's start or end (`'top-start'`, `'top-end'`, `'right-start'` and so on), takes a negative `gap` to overlap the box, and can be `pinned`: it then stays where it's put, with no flipping and no moving to stay in view. `projectAnchoredTarget` takes its options as one object (`{ placement, gap, pinned }`) and returns `null` once the box is too far out of view for the UI to reach into it; a `ViewProjector` reports its visible area with `view()`. An anchor can carry `boundsIn(view)` for a box that depends on the view, such as a note that keeps its size on screen.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Update browser interaction, page gestures, selection handles, and rich-text
  editing for durable page references and page-space coordinates. Web helpers
  now use the revised plugin and engine contracts across viewer surfaces.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Add `frameInPixels(frame, page)`, a render item's frame in the page layer's pixels with its CSS turn, its turn on screen, and the size and scale a look is drawn at, and `rasterInFrame(raster, frame)`, the raster inside its frame as CSS percentages, so it lands in place at any frame size. The same for every framework adapter.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `mountFontProgram(program)`: mount a font program under its own family, in its own weight and style, so the browser never fakes a bold or an italic. Refcounted per document, like `mountWebFont`.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `focusablesIn` and `tabbablesIn` see through a `<slot>`: the elements a web component's slot shows (its slotted children) count in their place, and the slot's own fallback content doesn't while something is slotted. So a toolbar's arrow keys reach a slotted item's first control, and a focus trap keeps slotted controls in its Tab order.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Toolbar measuring works along either axis: `createToolbarLengths()` replaces `createToolbarWidths()` and keeps each orientation's lengths apart (`report(orientation, key, length)`, `metrics(orientation, gap, separatorWidth)`), next to the new `observeHeight`, `observeContentHeight`, and `observeLength` / `observeContentLength`, which pick the side from the orientation.

  Add a framework-free keyboard model. `attachRovingFocus(container, { orientation, stops })` makes a row one tab stop with arrow keys along its orientation, Home and End, passing over disabled controls, Left and Right swapped in right-to-left text, and leaving a text field or select its own keys; `attachToolbarFocus(toolbar, orientation)` does it for a toolbar whose items are marked with `TOOLBAR_ITEM_ATTRIBUTE` (each item's first focusable element is its stop). `attachMenuKeys(menu, { trigger, close })` drives an open menu: focus on its first item, arrow keys, typeahead, Enter and Space, Escape and Tab closing it with focus back on its button, and `aria-expanded` on the button. `attachFocusTrap(container)` keeps focus in a dialog or sheet and returns it on release, nesting. The pieces underneath are exported too: `focusablesIn`, `tabbablesIn`, `canTakeFocus`, `isTabbable`, `isUnavailable`, `usesKey`, `deepActiveElementOf`, `directionOf`, `rovingMoveOf`, `rovingTargetOf`, `typeaheadMatchOf`, `menuItemLabelOf` and the `Orientation` type.

  `bindCommandShortcuts` takes the key of a command that's turned off or not allowed, so the browser doesn't act on it (Ctrl/Cmd+P no longer prints the page when printing isn't allowed), and reports why through the new `onRefused(commandId, refusal)` option. `ShortcutCommands.matchStroke` returns `{ commandId, refusal }`. `wireSelectionClipboard` prevents Ctrl/Cmd+C and the browser's copy of a selection the user may not copy, and calls the new `onRefused` option. Both leave keys and copies in a text field alone, inside a shadow root too.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Add `observeOutsidePress(element, onPress)`: calls `onPress` for a pointer press anywhere in the document outside `element`, read from the press's composed path so it works for an element inside a shadow root. `mountWebFont(key, data)` now mounts the face under the family `epdf-<key>`, so a family of the same name on the page never stands in for a registered font; the rich text editor reads that family back as the key.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `svgShapesOf` draws `glyphs` nodes as SVG text with one position per character (a space, which draws nothing, left out) and puts a clipped node inside an `svg` of its clip box.

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Add the framework-neutral parts of the page layers, so every framework adapter shares one implementation: page boxes and quads in a layer's pixels (`rectInPixels`, `quadInPixels`, `svgPoints`, `isUprightQuad`); an annotation scene as SVG element descriptions (`svgShapesOf`, `sceneViewBox`, `ghostOpacity`); the selection chrome's paint and pixels (`annotationChromePaint`, `chromeInPixels`); the free-text editor controller (`attachTextBoxEditor`, `textBoxStyleOf`, `textPlateInPixels`); renderer behaviors and drawing ownership (`registerRendererBehaviors`, `rendererBehaviorId`, `lookRendererFor`, `annotationDrawingOf`, `lookFrameOf`); object URLs for previews and baked appearances (`objectUrlOf`, `loadObjectUrl`, `loadAppearanceUrls`); comment threads with page positions (`enrichCommentThreads`); anchor equality (`samePageBounds`, `sameSelectionAnchor`, `sameAnnotationAnchor`, `sameCreationDraftAnchor`, `sameRotationAnchor`, `sameSelectionEndpoints`); form field colors, looks, widget events and editing policies (`formColorsOf`, `cssFontOf`, `textFieldStyleOf`, `listBoxStyleOf`, `bindWidgetEvents`, `pressToggle`, `createTextFieldEditor`, `createOptimisticSelection`); event isolation (`isolatePointerDown`, `isolateWheel`); link anchors (`linkHrefOf`, `navigableLinksOf`, `isModifiedClick`, `openExternalUri`); click detection (`createClickDetector`); a standalone page's projector (`clientPageProjector`); toolbar measuring (`createToolbarWidths`, `observeWidth`, `observeContentWidth`, `toolbarMeasureKey`); the default file prompt (`pickRequestedFile`); and the browser's part of the standard commands (`standardCommandsBrowser`).

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Add the annotation, form and signature parts every framework adapter wrote for itself, so they share one implementation:
  - Text boxes: `createTextBoxEditorFollower()` keeps an element the editor of a text box while the element, the plugin, the box and the scale change; `textBoxEditorScaleOf(item, page, lookScale)` is the pixels per point of an editor element a renderer draws itself; `editingTextKeyOf(texts, keyOf)` names the text box being typed in; `layerTextBoxesOf(texts, items, renderers, keyOf)` leaves out the text boxes a look of yours edits.
  - `bakedAppearanceOf(urls, key)`: an annotation's loaded picture as a renderer's `appearance`.
  - `installFilePickerProvider(annotation, provider, onRepeat)`: one file picker per document, and a call when a second install replaces the first.
  - The form layer's styles as style records: `widgetBoxStyleOf`, `textFieldEditorStyleOf`, `listBoxControlStyleOf`, `formFocusRingStyleOf` and `FORM_CONTROL_FILL`; and `showSelectedOptions(select, values)`, a selection shown on a native `<select>`'s options.
  - `cssText(style)`: a style record as CSS text, for a framework whose `style` is a string.

  `CssFont`, `FieldTextStyle`, `TextFieldStyle` and `ListBoxStyle` are type aliases now, so they fit a style type with an index signature for custom properties (Vue's `CSSProperties`).

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Add what every framework's page surfaces share:
  - `makePageContext`, `livePageContext`, `pageClientSpace` and the `PageContext` type: the page context a Stage page or a page view hands its layers, and its client-space conversions.
  - `pageSurfaceLayout(transform, frame, footprint?)`: a page surface's outer, shadow and turned content boxes. `stagePageDemand(stage, page, deviceWidth)`: what a Stage page's view wants rendered. `pageViewTransformInput(page, width, dpr)`: a page view's transform input, with 100% at 96/72 CSS pixels per point times the page's /UserUnit.
  - `stageViewProjector(() => stage)`: the Stage's projector for anchored UI. `clientPageProjector` also takes a page whose `transform` is a function (a signal).
  - `attachPagePointer(element, hub, page)` and `createClickCounter()`: a page's pointer listener for the interaction plugin.
  - `scrollbarLayout(...)` and `createScrollbarPresses(onDragging)`: a Stage scrollbar's thumb geometry, drags, and track paging.
  - `toolCursorsOf(cursors)` with the `ToolCursorImage` and `ToolCursorSpec` types: a tool's cursors as CSS cursor values.
  - `anchoredViewOf`, `sameAnchoredFit` and `observeAnchoredFit`: measuring anchored UI and the area it stays inside.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Add the search and link layers' parts every framework adapter wrote for itself: `searchHighlightsOf(hits, options)` (each line of each match as a box or a polygon, in the active or the plain color); `linkAnchorOf(link, page, labelOf)` (a link's box, `href` and label); `linkActivateContextOf(link, page, stage)`, `sendLinkEvent(actions, link, page, event)` and `hoverLink(pump, link, page)` (what a link's anchor tells the link and actions plugins). `copySelection(selection)` takes anything with `readText()`.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – A PDF link without a scheme no longer opens relative to the page around the viewer. An address starting with `//` or `www.` opens on https; any other, such as `/admin` or `page2.html`, is relative to the document and opens nothing (it used to open that path on the app's own site).

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – New `isolatePointerDown(element, onPress)`: a press inside a control (a link, a form field) stops there instead of reaching the Stage below, and `onPress` takes it for the control. A framework that dispatches from its root, as React does, sees the press only after the Stage has, so its control takes the press here.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The file dialog (`pickFile`, `pickImageFile`, `pickRequestedFile`) keeps the file the user picks. It took the window getting its focus back for a closed dialog and, 300 ms later, answered "no file", so a pick that came later than that (a file in iCloud Drive or on a network drive, an app's embedded browser) was dropped: the viewer's Open, the image tool and file attachments did nothing. It now goes by the dialog's own `change` and `cancel` events, which every supported browser fires.

## 3.0.0-next.14

## 3.0.0-next.13

### Minor Changes

- [#817](https://github.com/embedpdf/embed-pdf-viewer/pull/817) by [@bobsingor](https://github.com/bobsingor) – Add a framework-independent rich-text editor binding with styled paragraph rendering, DOM serialization, selection mapping, formatting commands, and plain-text paste handling.

  Export `mountWebFont()` to load font bytes for live editors and release shared font faces only after their last consumer unmounts.

## 3.0.0-next.12

### Minor Changes

- [#803](https://github.com/embedpdf/embed-pdf-viewer/pull/803) by [@bobsingor](https://github.com/bobsingor) – `indexedDbByteStore(dbName, { storeName? })` is the browser's bytes-by-id store: one IndexedDB object store with `list`, `put`, and `delete`. It is the adapter for any plugin's DOM-free persistence port (structurally `StampLibraryStore` from `@embedpdf/plugin-stamp`), written once here so every framework binding shares it.

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – `createDefaultActionsUiAdapter` — the actions UI adapter's DEFAULT policy (the origin×phase visibility matrix: hover/lifecycle prints suppressed, boot/lifecycle alerts suppressed, sanitizeExternalUri URI opens, browser fallbacks), hoisted here and written ONCE so every framework binding (react, angular) ships the same behavior instead of forking it. Structural twins keep this package plugin-free per the layering law; `overrides` accepts a getter for late-bound handlers.

## 3.0.0-next.10

## 3.0.0-next.9

## 3.0.0-next.8

## 3.0.0-next.7

### Minor Changes

- [#775](https://github.com/embedpdf/embed-pdf-viewer/pull/775) by [@bobsingor](https://github.com/bobsingor) – Add shared browser Stage surface and touch gesture controllers with lens-scoped input, pan, pinch, fling, double-tap, long-press, and wheel handling. Export vibration and native-shell feedback providers.

- [#776](https://github.com/embedpdf/embed-pdf-viewer/pull/776) by [@bobsingor](https://github.com/bobsingor) – Add a shared native DOM binding for selection-handle drags that shields Stage gestures and handles pointer capture and client-delta tracking.

## 3.0.0-next.6

### Minor Changes

- [#768](https://github.com/embedpdf/embed-pdf-viewer/pull/768) by [@bobsingor](https://github.com/bobsingor) – Add `bindPaintedImage`, a framework-neutral browser adapter for binding object-URL raster sources to image elements. It hides incomplete images, owns abort and URL-revocation cleanup, and reports painted and unpainted state around the image's presented lifetime so React, Vue, Svelte, and Angular adapters can share the same minimal lifecycle.

## 3.0.0-next.5

### Minor Changes

- [#759](https://github.com/embedpdf/embed-pdf-viewer/pull/759) by [@bobsingor](https://github.com/bobsingor) – Add framework-neutral anchored-overlay projection and placement utilities for Stage and standalone page surfaces. Add browser clipboard helpers for selected-text prefetch, native copy events, keyboard fallback, and user-initiated clipboard writes while keeping selection plugins DOM-free.

## 3.0.0-next.4

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces framework-independent browser adapters for EmbedPDF v3. It centralizes DOM-facing services such as file selection, clipboard access, printing, downloads, and external navigation so core packages remain platform-neutral.
