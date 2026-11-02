# @embedpdf/core-geometry

## 3.0.0-next.20

## 3.0.0-next.19

## 3.0.0-next.18

## 3.0.0-next.17

## 3.0.0-next.16

## 3.0.0-next.15

### Minor Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `containedRect(content, box)`: the largest rect of `content`'s proportions inside `box`, centred, as CSS `object-fit: contain` places it.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Rect algebra: `rectFromCorners`, `rectContains`, `rectsOverlap` for y-down rects, and `edgesOverlap`, `edgesOfQuad` for PDF edges.

- [#830](https://github.com/embedpdf/embed-pdf-viewer/pull/830) by [@bobsingor](https://github.com/bobsingor) – Add `pageSpace(crop)`, the one owner of page ↔ PDF conversion for a page (points, rectangles and quads both ways), plus the `PagePoint`, `PageRect` and `PageQuad` aliases for page space.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Expose page-space geometry and text quadrilaterals with corners named in
  reading order. Update page transforms and coordinate helpers so callers can
  convert between page, content, view, and pixel coordinates consistently.

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Add `samePagePlacement(left, right)`: whether two page transforms place things on the page the same (scale, zoom, turn and content box), so a layer redraws only when what it draws moved, not on a plain scroll.

## 3.0.0-next.14

## 3.0.0-next.13

## 3.0.0-next.12

## 3.0.0-next.11

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
