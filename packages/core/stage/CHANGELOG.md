# @embedpdf/core-stage

## 3.0.0-next.20

### Minor Changes

- [#949](https://github.com/embedpdf/embed-pdf-viewer/pull/949) by [@bobsingor](https://github.com/bobsingor) – The padding can differ per side: `Padding` is one number for every side or `PaddingSides` (`{ top, right, bottom, left }`, physical sides, the same right to left), and `paddingSidesOf()` gives each side of either. `CameraConstraint.padding`, `scrollMetrics()`, `cameraFromScroll()` and `placeCamera()` take it, and `travelRange()` takes the room before and after the content (`after` defaults to `before`).

## 3.0.0-next.19

### Minor Changes

- [#923](https://github.com/embedpdf/embed-pdf-viewer/pull/923) by [@bobsingor](https://github.com/bobsingor) – Zoom limits: `ZoomLimits` is a view's zoom range, `resolveZoomLimits(minZoom, maxZoom)` makes one inside `ZOOM_MIN` and `ZOOM_MAX` (a `minZoom` above `maxZoom` counts as `maxZoom`), and `clampZoom(zoom, limits)` keeps a zoom inside it. `resolveZoom()` and `zoomAround()` take the limits as a last argument; without it they keep the full range.

## 3.0.0-next.18

## 3.0.0-next.17

## 3.0.0-next.16

## 3.0.0-next.15

### Minor Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Move stage geometry and navigation to the page-space coordinate model, with
  durable page references for layout and reveal operations.

## 3.0.0-next.14

## 3.0.0-next.13

## 3.0.0-next.12

## 3.0.0-next.11

## 3.0.0-next.10

## 3.0.0-next.9

## 3.0.0-next.8

## 3.0.0-next.7

## 3.0.0-next.6

## 3.0.0-next.5

## 3.0.0-next.4

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the pure spatial model behind the EmbedPDF stage. It models scenes, layout strategies, camera state, anchors, framing, and coordinate conversion without framework or DOM dependencies.
