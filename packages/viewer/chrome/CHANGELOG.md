# @embedpdf/viewer-chrome

## 3.0.0-next.11

### Patch Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – The viewer wires the action engine in: `actionsPlugin()` joins the plugin set and the Shell installs the default URI/Print UI adapter.

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – The chrome save/print commands become the Phase-4 verb owners: `document:download` runs WS → serialize → DS as ONE queued operation (the WillSave mutations are IN the downloaded bytes; two rapid saves can never interleave) and `document:print` runs WP → `window.print()` → DP under the reentrancy latch — both degrading to today's behavior when the actions plugin is absent.

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Scripting migrates to `actionsPlugin({ javascript: { enabled: true } })` with a bare `formPlugin()`; the Shell's form scripting provider hook is gone — `useActionsUiAdapter` carries everything.

## 3.0.0-next.10

### Minor Changes

- [#788](https://github.com/embedpdf/embed-pdf-viewer/pull/788) by [@bobsingor](https://github.com/bobsingor) – Add a comments and review sidebar with loading, retry, and navigation states,
  plus an anchored editor for annotation links. Commands and controls now
  reflect document and per-record permissions, with updated locale strings for
  the new states.

## 3.0.0-next.9

## 3.0.0-next.8

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
