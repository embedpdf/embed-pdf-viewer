# @embedpdf/react

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
