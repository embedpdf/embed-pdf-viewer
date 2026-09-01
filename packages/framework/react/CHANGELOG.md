# @embedpdf/react

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
