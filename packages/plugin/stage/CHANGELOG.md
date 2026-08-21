# @embedpdf/plugin-stage

## 3.0.0-next.7

## 3.0.0-next.6

### Minor Changes

- [#768](https://github.com/embedpdf/embed-pdf-viewer/pull/768) by [@bobsingor](https://github.com/bobsingor) – Expose transient `cameraResting` state and defer page-origin device snapping while zoom is moving. Pages retain fractional placement through continuous zoom and snap once the camera settles, preventing anchor jitter and per-step content movement without sacrificing crisp resting placement.

## 3.0.0-next.5

## 3.0.0-next.4

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the rebuilt document stage plugin. It combines scrolling, viewport measurement, zoom, pan, spread layouts, navigation, and coordinate conversion through pure intents and selectors built on `@embedpdf/core-stage`.
