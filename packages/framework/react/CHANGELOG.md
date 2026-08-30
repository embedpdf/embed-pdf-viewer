# @embedpdf/react

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
