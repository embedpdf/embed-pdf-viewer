# @embedpdf/plugin-viewport

## 1.4.0

### Minor Changes

- [#222](https://github.com/embedpdf/embed-pdf-viewer/pull/222) by [@andrewrisse](https://github.com/andrewrisse) – feat: Add Svelte 5 adapter (`/svelte` export) with Rune-based hooks (`useViewportPlugin`, `useViewportCapability`, `useViewportRef`) and `Viewport.svelte` component. Thanks to @andrewrisse for the Svelte integration!

## 1.3.16

### Patch Changes

- [`fa0e3a8`](https://github.com/embedpdf/embed-pdf-viewer/commit/fa0e3a87977dfdd2e040a2612bcc4779a286db03) by [@bobsingor](https://github.com/bobsingor) – Guard against late callbacks after registry teardown

## 1.3.15

### Patch Changes

- [`d64672d`](https://github.com/embedpdf/embed-pdf-viewer/commit/d64672df3ba1e5b1d0c0d94c25677158aac85fb9) by [@bobsingor](https://github.com/bobsingor) – Prevent resize handling after cleanup in useViewportRef

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

- [#141](https://github.com/embedpdf/embed-pdf-viewer/pull/141) by [@bobsingor](https://github.com/bobsingor) – Change `onScrollActivity` payload from `boolean` to structured object and add convenience hooks.

  ### What changed

  - `ViewportCapability.onScrollActivity` now emits a **`ScrollActivity`** object:
    ```ts
    export interface ScrollActivity {
      isSmoothScrolling: boolean;
      isScrolling: boolean;
    }
    ```

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

- [#43](https://github.com/embedpdf/embed-pdf-viewer/pull/43) by [@bobsingor](https://github.com/bobsingor) – Add support for Vue to viewport plugin

- [#47](https://github.com/embedpdf/embed-pdf-viewer/pull/47) by [@bobsingor](https://github.com/bobsingor) – Update viewport plugin to have shared code between react and preact to simplify workflow

## 1.0.11

## 1.0.10

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
