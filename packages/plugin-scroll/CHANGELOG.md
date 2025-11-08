# @embedpdf/plugin-scroll

## 1.4.1

### Patch Changes

- [#234](https://github.com/embedpdf/embed-pdf-viewer/pull/234) by [@bobsingor](https://github.com/bobsingor) – refactor(svelte): Update `Scroller.svelte` component and `useScroll` hook to use refactored core hooks and return a reactive state object. Introduced shared `RenderPageProps` type. Adjusted Vue components accordingly.

## 1.4.0

### Minor Changes

- [#222](https://github.com/embedpdf/embed-pdf-viewer/pull/222) by [@andrewrisse](https://github.com/andrewrisse) – feat: Add Svelte 5 adapter (`/svelte` export) with Rune-based hooks (`useScroll`, etc.) and `Scroller.svelte` component. Thanks to @andrewrisse for adding the Svelte adapter and hooks!

## 1.3.16

## 1.3.15

## 1.3.14

## 1.3.13

## 1.3.12

## 1.3.11

## 1.3.10

## 1.3.9

## 1.3.8

## 1.3.7

## 1.3.6

## 1.3.5

### Patch Changes

- [#187](https://github.com/embedpdf/embed-pdf-viewer/pull/187) by [@bobsingor](https://github.com/bobsingor) – Add isPageChanging event to the scrol plugin

## 1.3.4

## 1.3.3

## 1.3.2

## 1.3.1

## 1.3.0

### Patch Changes

- [#168](https://github.com/embedpdf/embed-pdf-viewer/pull/168) by [@Ludy87](https://github.com/Ludy87) – Add license fields to the package.json with the value MIT

## 1.2.1

## 1.2.0

## 1.1.1

## 1.1.0

### Minor Changes

- [#141](https://github.com/embedpdf/embed-pdf-viewer/pull/141) by [@bobsingor](https://github.com/bobsingor) – Refactor scroller layout API and scroll helpers.
  - **Moved scroller layout APIs from capability → plugin instance**
    - Removed from `ScrollCapability`:
      - `onScrollerData`
      - `getScrollerLayout`
    - Added to `ScrollPlugin`:
      - `onScrollerData(callback): Unsubscribe`
      - `getScrollerLayout(): ScrollerLayout`
  - Exposed `ScrollBehavior` type (`'instant' | 'smooth' | 'auto'`) and plumbed through all scroll helpers.
  - Bound capability methods to plugin instance:
    - `scrollToPage`, `scrollToNextPage`, `scrollToPreviousPage` now call internal plugin methods (no behavior change for callers).
  - Added auto-jump on first layout:
    - If `initialPage` is set, we now scroll **instantly** to it after layout ready.
  - Strategy/base types:
    - `BaseScrollStrategy.getTotalContentSize()` now returns `Size` instead of `{ width; height }`.
    - Page-rect computations now account for horizontal centering within `totalContentSize`.

## 1.0.26

## 1.0.25

## 1.0.24

## 1.0.23

## 1.0.22

## 1.0.21

### Patch Changes

- [#119](https://github.com/embedpdf/embed-pdf-viewer/pull/119) by [@bobsingor](https://github.com/bobsingor) – Add and fix Vue packages!

## 1.0.20

## 1.0.19

## 1.0.18

## 1.0.17

## 1.0.16

## 1.0.15

## 1.0.14

## 1.0.13

## 1.0.12

### Patch Changes

- [#43](https://github.com/embedpdf/embed-pdf-viewer/pull/43) by [@bobsingor](https://github.com/bobsingor) – Make the scroll plugin work with Vue

- [#47](https://github.com/embedpdf/embed-pdf-viewer/pull/47) by [@bobsingor](https://github.com/bobsingor) – Update scroll plugin to have shared code between react and preact to simplify workflow

## 1.0.11

### Patch Changes

- [`8bb2d1f`](https://github.com/embedpdf/embed-pdf-viewer/commit/8bb2d1f56280ea227b323ec0cdd90478d076ad97) by [@bobsingor](https://github.com/bobsingor) – Send emit message when the layout is ready so that you can easily do initial page scroll

## 1.0.10

### Patch Changes

- [`f629db4`](https://github.com/embedpdf/embed-pdf-viewer/commit/f629db47e1a2693e913defbc1a9e76912af945e3) by [@bobsingor](https://github.com/bobsingor) – Some small bugfixes, in some cases interactionmanager state can be null and gives error on fast reload, add get state to selection manager for debugging purposes and make @embedpdf/model a dependency of scroll to make sure it doesn't get add inline inside the component

## 1.0.9

## 1.0.8

## 1.0.7

## 1.0.6

## 1.0.5

## 1.0.4

## 1.0.3

## 1.0.2

## 1.0.1

### Patch Changes

- [#15](https://github.com/embedpdf/embed-pdf-viewer/pull/15) by [@bobsingor](https://github.com/bobsingor) – Expose a couple of missing APIs for the MUI example package
