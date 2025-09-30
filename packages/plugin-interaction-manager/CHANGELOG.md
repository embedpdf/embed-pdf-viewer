# @embedpdf/plugin-interaction-manager

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

- [#141](https://github.com/embedpdf/embed-pdf-viewer/pull/141) by [@bobsingor](https://github.com/bobsingor) – Simplified usage of `PagePointerProvider`:

  - Added default `position: relative`, `width`, and `height` styles to the React and Vue implementations of `PagePointerProvider`. Consumers no longer need to manually set these.
  - Ensures consistent sizing based on `pageWidth` and `pageHeight`.

  This makes integration easier and reduces boilerplate when embedding the pointer provider.

## 1.0.26

## 1.0.25

## 1.0.24

## 1.0.23

## 1.0.22

### Patch Changes

- [`4ac0158`](https://github.com/embedpdf/embed-pdf-viewer/commit/4ac01585be8e6cb3592eb302f263fcf635948801) by [@bobsingor](https://github.com/bobsingor) – Change pageWidth and pageHeight to the non-rotated values for cleaner interface because we already pass the rotation

## 1.0.21

### Patch Changes

- [#119](https://github.com/embedpdf/embed-pdf-viewer/pull/119) by [@bobsingor](https://github.com/bobsingor) – Add and fix Vue packages!

## 1.0.20

### Patch Changes

- [`da0c418`](https://github.com/embedpdf/embed-pdf-viewer/commit/da0c418d40ada1911f8a6b30ab26bd23dafca9b4) by [@bobsingor](https://github.com/bobsingor) – Fix firefox issue

## 1.0.19

## 1.0.18

### Patch Changes

- [#72](https://github.com/embedpdf/embed-pdf-viewer/pull/72) by [@bobsingor](https://github.com/bobsingor) – Abstract away the setPointerCapture and releasePointerCapture for better way to interact

## 1.0.17

## 1.0.16

### Patch Changes

- [#59](https://github.com/embedpdf/embed-pdf-viewer/pull/59) by [@bobsingor](https://github.com/bobsingor) – Add default mode to interaction manager and support for touch

## 1.0.15

## 1.0.14

## 1.0.13

### Patch Changes

- [#51](https://github.com/embedpdf/embed-pdf-viewer/pull/51) by [@bobsingor](https://github.com/bobsingor) – Add onClick and onDoubleClick options to the interaction manager

## 1.0.12

### Patch Changes

- [#47](https://github.com/embedpdf/embed-pdf-viewer/pull/47) by [@bobsingor](https://github.com/bobsingor) – Update interaction manager plugin to have shared code between react and preact to simplify workflow

- [#43](https://github.com/embedpdf/embed-pdf-viewer/pull/43) by [@bobsingor](https://github.com/bobsingor) – Add vue layer for the interaction-manager

## 1.0.11

## 1.0.10

### Patch Changes

- [`f629db4`](https://github.com/embedpdf/embed-pdf-viewer/commit/f629db47e1a2693e913defbc1a9e76912af945e3) by [@bobsingor](https://github.com/bobsingor) – Some small bugfixes, in some cases interactionmanager state can be null and gives error on fast reload, add get state to selection manager for debugging purposes and make @embedpdf/model a dependency of scroll to make sure it doesn't get add inline inside the component

## 1.0.9

## 1.0.8

### Patch Changes

- [#38](https://github.com/embedpdf/embed-pdf-viewer/pull/38) by [@bobsingor](https://github.com/bobsingor) – Option to pause and resume interaction manager

## 1.0.7

### Patch Changes

- [#33](https://github.com/embedpdf/embed-pdf-viewer/pull/33) by [@bobsingor](https://github.com/bobsingor) – Allow one handler for multiple modes and add event for when handler becomes active and ends

- [#34](https://github.com/embedpdf/embed-pdf-viewer/pull/34) by [@bobsingor](https://github.com/bobsingor) – Update pointer handler hooks to deal with multiple modes and option to update modes on the register function

## 1.0.6

## 1.0.5

## 1.0.4

## 1.0.3

## 1.0.2

### Patch Changes

- [#18](https://github.com/embedpdf/embed-pdf-viewer/pull/18) by [@bobsingor](https://github.com/bobsingor) – Add missing react package for MUI example to work

## 1.0.1

### Patch Changes

- [#15](https://github.com/embedpdf/embed-pdf-viewer/pull/15) by [@bobsingor](https://github.com/bobsingor) – Expose a couple of missing APIs for the MUI example package
