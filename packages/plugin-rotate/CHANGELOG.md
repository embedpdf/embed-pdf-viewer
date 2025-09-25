# @embedpdf/plugin-rotate

## 1.3.1

## 1.3.0

### Patch Changes

- [#168](https://github.com/embedpdf/embed-pdf-viewer/pull/168) by [@Ludy87](https://github.com/Ludy87) – Add license fields to the package.json with the value MIT

## 1.2.1

## 1.2.0

## 1.1.1

## 1.1.0

### Minor Changes

- [#141](https://github.com/embedpdf/embed-pdf-viewer/pull/141) by [@bobsingor](https://github.com/bobsingor) – Refactored rotate plugin API and utilities:

  - Moved `getNextRotation`, `getPreviousRotation`, and rotation matrix helpers into `utils`.
  - Split matrix helpers into:
    - **`getRotationMatrix`** → returns the numeric 6-tuple.
    - **`getRotationMatrixString`** → returns a CSS `matrix(...)` string.
  - `RotateCapability.onRotateChange` is now typed as an **`EventHook<Rotation>`**.
  - Added **`getMatrixAsString`** method to `RotatePlugin` for CSS transforms.
  - Updated React (`Rotate` component + hook) and Vue (`rotate.vue` + hook) to use `useRotatePlugin` and the new API.
  - Added new `useRotate` hooks (React + Vue) for reactive rotation state.

  These changes make the rotate plugin API more consistent, typed, and ergonomic across frameworks.

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

- [#47](https://github.com/embedpdf/embed-pdf-viewer/pull/47) by [@bobsingor](https://github.com/bobsingor) – Update rotate plugin to have shared code between react and preact to simplify workflow

- [#43](https://github.com/embedpdf/embed-pdf-viewer/pull/43) by [@bobsingor](https://github.com/bobsingor) – Add vue layer to the rotate plugin package

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
