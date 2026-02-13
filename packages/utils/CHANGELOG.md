# @embedpdf/utils

## 2.6.0

### Minor Changes

- [#452](https://github.com/embedpdf/embed-pdf-viewer/pull/452) by [@bobsingor](https://github.com/bobsingor) –
  - Update `DragResizeController` to support rotation interactions.
  - Add `useInteractionHandles` support for rotation handles.
  - Add rotation snapping and constraints.

## 2.5.0

### Patch Changes

- [#441](https://github.com/embedpdf/embed-pdf-viewer/pull/441) by [@bobsingor](https://github.com/bobsingor) – Fixed resize handle cursors to account for page rotation:
  - Updated `diagonalCursor()` function to swap `ns-resize` and `ew-resize` cursors for edge handles (n, s, e, w) on odd rotation values (90° and 270°)
  - Reorganized cursor logic to handle edge handles separately from corner handles

  Previously, edge resize handles showed incorrect cursors on rotated pages (e.g., north handle showed `ns-resize` instead of `ew-resize` on 90° rotated pages).

## 2.4.1

## 2.4.0

## 2.3.0

## 2.2.0

## 2.1.2

## 2.1.1

## 2.1.0

## 2.0.2

### Patch Changes

- [#360](https://github.com/embedpdf/embed-pdf-viewer/pull/360) by [@bobsingor](https://github.com/bobsingor) – Fixed aspect ratio being lost when resizing annotations near canvas bounding box edges.

## 2.0.1

## 2.0.0

### Minor Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  Added utilities for selection menu positioning and context handling.

  ### New Features
  - **SelectionMenuPlacement**: New interface for placement hints when positioning selection menus (suggestTop, spaceAbove, spaceBelow).
  - **SelectionMenuContextBase**: Base context type that all layer contexts must extend, providing a discriminated union pattern for menu contexts.
  - **Selection Menu Utilities**: New selection menu utilities exported from the main utils package.

### Patch Changes

- [#303](https://github.com/embedpdf/embed-pdf-viewer/pull/303) by [@bobsingor](https://github.com/bobsingor) – Refactored `CounterRotateContainer` to use a Svelte action (`action: Action<HTMLElement>`) instead of a ref callback (`ref: (el: HTMLElement | null) => void`). This is the idiomatic Svelte pattern for attaching lifecycle-managed behavior to DOM elements. Updated `MenuWrapperProps` type accordingly.

  **Migration:**

  ```svelte
  <!-- Before -->
  <span bind:this={el} style={menuWrapperProps.style}>
  $effect(() => { menuWrapperProps.ref(el); });

  <!-- After -->
  <span use:menuWrapperProps.action style={menuWrapperProps.style}>
  ```

## 2.0.0-next.3

## 2.0.0-next.2

## 2.0.0-next.1

### Patch Changes

- [`caec11d`](https://github.com/embedpdf/embed-pdf-viewer/commit/caec11d7e8b925e641b4834aadf9a126edfb3586) by [@bobsingor](https://github.com/bobsingor) – Refactored `CounterRotateContainer` to use a Svelte action (`action: Action<HTMLElement>`) instead of a ref callback (`ref: (el: HTMLElement | null) => void`). This is the idiomatic Svelte pattern for attaching lifecycle-managed behavior to DOM elements. Updated `MenuWrapperProps` type accordingly.

  **Migration:**

  ```svelte
  <!-- Before -->
  <span bind:this={el} style={menuWrapperProps.style}>
  $effect(() => { menuWrapperProps.ref(el); });

  <!-- After -->
  <span use:menuWrapperProps.action style={menuWrapperProps.style}>
  ```

## 2.0.0-next.0

### Minor Changes

- [#279](https://github.com/embedpdf/embed-pdf-viewer/pull/279) by [@bobsingor](https://github.com/bobsingor) – ## Multi-Document Support

  Added utilities for selection menu positioning and context handling.

  ### New Features
  - **SelectionMenuPlacement**: New interface for placement hints when positioning selection menus (suggestTop, spaceAbove, spaceBelow).
  - **SelectionMenuContextBase**: Base context type that all layer contexts must extend, providing a discriminated union pattern for menu contexts.
  - **Selection Menu Utilities**: New selection menu utilities exported from the main utils package.

## 1.5.0

## 1.4.1

## 1.4.0

## 1.3.16

## 1.3.15

## 1.3.14

### Patch Changes

- [`d4092ea`](https://github.com/embedpdf/embed-pdf-viewer/commit/d4092ea637d92c42af4ca2e51db589e707cad920) by [@bobsingor](https://github.com/bobsingor) – Removed preventDefault() from pointer and touch event handlers in CounterRotateContainer to ensure buttons remain functional on mobile and tablet devices. Now only stopPropagation() is used to prevent event propagation without interfering with native click generation.

## 1.3.13

### Patch Changes

- [`e5d4729`](https://github.com/embedpdf/embed-pdf-viewer/commit/e5d47296346f4ed68873b254ec6c55b75beb5342) by [@bobsingor](https://github.com/bobsingor) – Updates MenuWrapperProps and counter-rotate-container.vue to use lowercase event handler props for pointer and touch events

## 1.3.12

### Patch Changes

- [#204](https://github.com/embedpdf/embed-pdf-viewer/pull/204) by [@bobsingor](https://github.com/bobsingor) – Improved pointer event handling in counter-rotate containers to prevent unwanted text selection

## 1.3.11

## 1.3.10

## 1.3.9

## 1.3.8

## 1.3.7

## 1.3.6

## 1.3.5

## 1.3.4

## 1.3.3

## 1.3.2

## 1.3.1

## 1.3.0

### Patch Changes

- [#168](https://github.com/embedpdf/embed-pdf-viewer/pull/168) by [@Ludy87](https://github.com/Ludy87) – Add license fields to the package.json with the value MIT

## 1.2.1

## 1.2.0

### Patch Changes

- [#153](https://github.com/embedpdf/embed-pdf-viewer/pull/153) by [@bobsingor](https://github.com/bobsingor) – Move draging and resize interaction hooks logic to the utils package.

## 1.1.1

## 1.1.0

## 1.0.26

## 1.0.25

## 1.0.24

## 1.0.23

## 1.0.22
