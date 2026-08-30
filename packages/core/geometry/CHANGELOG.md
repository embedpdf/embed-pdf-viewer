# @embedpdf/core-geometry

## 3.0.0-next.10

### Minor Changes

- [#788](https://github.com/embedpdf/embed-pdf-viewer/pull/788) by [@bobsingor](https://github.com/bobsingor) – Clarify the public page transform API around content-space coordinates. Add
  `toPixels` and `fromPixels`, and rename the display conversions to
  `contentToView`, `contentToViewRect`, `viewToContent`, and
  `viewToContentRect`.

## 3.0.0-next.9

## 3.0.0-next.8

## 3.0.0-next.7

### Minor Changes

- [#776](https://github.com/embedpdf/embed-pdf-viewer/pull/776) by [@bobsingor](https://github.com/bobsingor) – Add `textQuadEdge` and `textQuadEquals` helpers for orientation-aware glyph edges and corner-wise text-quad change detection.

## 3.0.0-next.6

## 3.0.0-next.5

## 3.0.0-next.4

### Minor Changes

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Adds semantic `TextQuad` geometry with corner-named transforms, bounds, rectangle conversion, positional PDF quad conversion, and resilient normalization for imported `/QuadPoints`.

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the shared 2D geometry foundation for EmbedPDF. It provides points, sizes, page rotation, and coordinate transforms used across the stage, annotations, selection, and framework adapters.
