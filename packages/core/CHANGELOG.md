# @embedpdf/core

## 1.4.1

### Patch Changes

- [#234](https://github.com/embedpdf/embed-pdf-viewer/pull/234) by [@bobsingor](https://github.com/bobsingor) – refactor(svelte): Update Svelte hooks (`useCapability`, `useCoreState`, `usePlugin`) to return reactive `$state` objects instead of computed getters for better integration with Svelte 5's reactivity model.

## 1.4.0

### Minor Changes

- [#222](https://github.com/embedpdf/embed-pdf-viewer/pull/222) by [@andrewrisse](https://github.com/andrewrisse) – feat: Add Svelte 5 adapter (`/svelte` export) with Rune-based hooks (`useRegistry`, `usePlugin`, `useCapability`, `useCoreState`) and components (`EmbedPDF`, `AutoMount`, `NestedWrapper`). Enhanced core `Store` to prevent dispatches within reducers. Thanks to @andrewrisse for the Svelte integration work!

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

- [#141](https://github.com/embedpdf/embed-pdf-viewer/pull/141) by [@bobsingor](https://github.com/bobsingor) – Refactored action dispatch handling in `BasePlugin`:
  - Renamed `debouncedDispatch` to **`cooldownDispatch`**, which now executes immediately if the cooldown has expired and blocks rapid repeated calls.
  - Introduced a new **`debouncedDispatch`** method that provides true debouncing: waits until no calls occur for the specified time before dispatching.
  - Added **`cancelDebouncedDispatch`** to cancel pending debounced actions.
  - Added internal `debouncedTimeouts` tracking and ensured all timeouts are cleared on `destroy`.

  This improves clarity and provides both cooldown and debounce semantics for action dispatching.

## 1.0.26

## 1.0.25

## 1.0.24

## 1.0.23

## 1.0.22

## 1.0.21

### Patch Changes

- [#119](https://github.com/embedpdf/embed-pdf-viewer/pull/119) by [@bobsingor](https://github.com/bobsingor) – Add support for automount of wrapper and utility component (this will make the developer experience easier)

- [#119](https://github.com/embedpdf/embed-pdf-viewer/pull/119) by [@bobsingor](https://github.com/bobsingor) – Add utility and wrapper automount components

## 1.0.20

## 1.0.19

## 1.0.18

### Patch Changes

- [#72](https://github.com/embedpdf/embed-pdf-viewer/pull/72) by [@bobsingor](https://github.com/bobsingor) – Ability to refresh a page and cause rerender (necessary for redaction)

## 1.0.17

## 1.0.16

## 1.0.15

## 1.0.14

## 1.0.13

## 1.0.12

### Patch Changes

- [#47](https://github.com/embedpdf/embed-pdf-viewer/pull/47) by [@bobsingor](https://github.com/bobsingor) – Update core to have shared code between react and preact to simplify workflow

- [#43](https://github.com/embedpdf/embed-pdf-viewer/pull/43) by [@bobsingor](https://github.com/bobsingor) – Add support for vue for the @embedpdf/core package

## 1.0.11

## 1.0.10

## 1.0.9

## 1.0.8

## 1.0.7

## 1.0.6

## 1.0.5

### Patch Changes

- [`0e8f5d1`](https://github.com/embedpdf/embed-pdf-viewer/commit/0e8f5d1da3a331d00e1310d9f4249028f2d731b9) by [@bobsingor](https://github.com/bobsingor) – Make onInitialized function optional on the EmbedPDF component

## 1.0.4

### Patch Changes

- [#24](https://github.com/embedpdf/embed-pdf-viewer/pull/24) by [@bobsingor](https://github.com/bobsingor) – Move PDF engine hook to the engine package for consistency

- [`90bd467`](https://github.com/embedpdf/embed-pdf-viewer/commit/90bd46772b83b9b87b5c5886646193f308e7fdad) by [@bobsingor](https://github.com/bobsingor) – Add usePdfWorkerEngine to make engine initialization more straightforward

## 1.0.3

## 1.0.2

### Patch Changes

- [#18](https://github.com/embedpdf/embed-pdf-viewer/pull/18) by [@bobsingor](https://github.com/bobsingor) – Add missing react package for MUI example to work

## 1.0.1

### Patch Changes

- [#15](https://github.com/embedpdf/embed-pdf-viewer/pull/15) by [@bobsingor](https://github.com/bobsingor) – Expose a couple of missing APIs for the MUI example package
