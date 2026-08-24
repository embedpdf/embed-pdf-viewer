# @embedpdf/viewer-chrome

## 3.0.0-next.7

### Minor Changes

- [#775](https://github.com/embedpdf/embed-pdf-viewer/pull/775) by [@bobsingor](https://github.com/bobsingor) – Enable draggable touch selection handles and register vibration feedback by default when the platform supports it.

## 3.0.0-next.6

### Patch Changes

- [#768](https://github.com/embedpdf/embed-pdf-viewer/pull/768) by [@bobsingor](https://github.com/bobsingor) – Adopt the unified `RenderLayer` page composition so the full viewer gets policy-driven deep-zoom tiling without mounting a separate tile layer. Base and sharp tile pixels now follow one rendering lifecycle through zoom, pan, annotation, and page-view surfaces.

## 3.0.0-next.5

### Minor Changes

- [#759](https://github.com/embedpdf/embed-pdf-viewer/pull/759) by [@bobsingor](https://github.com/bobsingor) – Add a floating text-selection strip with permission-aware Copy, native keyboard clipboard wiring, localized labels, and shared contextual-strip rendering. A successful menu copy clears the unchanged selection so both its highlight and menu dismiss, while failed or superseded copies preserve the current selection.

## 3.0.0-next.4

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the shared implementation package for the full viewer interface. It contains the measured toolbar, menus, panels, responsive layout, and default feature composition consumed by the distributable viewer packages.
