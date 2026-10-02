import type { PageBox, PagePoint, PageQuad } from './pageSpace';
import type { PdfRotation, PdfSize } from './primitives';
import { renderSize } from './renderSize';
import type { PageRenderTarget, PageRenderViewport } from '../dto/PageRender';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';

/**
 * Page space and the pixels of a render. A render draws an area of the page
 * (the whole page, or a `target` rect), turned clockwise by `rotation`, onto
 * `width` × `height` pixels. The size is rounded to whole pixels and the area
 * is stretched to fill them exactly, so each axis has its own scale. The
 * renderer draws with {@link renderMatrix}, so a transform always matches the
 * pixels.
 */

/**
 * A 2D transform as the six numbers of a CSS `matrix()` or a canvas
 * `setTransform()`: `x' = a·x + c·y + e`, `y' = b·x + d·y + f`.
 */
export type PageRenderMatrix = readonly [
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
];

/** A point in an image's pixels, from its top-left corner, y down. */
export interface PixelPoint {
  x: number;
  y: number;
}

/** A box in an image's pixels: its top-left corner and its size. */
export interface PixelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A page-space quad in an image's pixels: each corner keeps its name. */
export interface PixelQuad {
  upperLeft: PixelPoint;
  upperRight: PixelPoint;
  lowerLeft: PixelPoint;
  lowerRight: PixelPoint;
}

/** Converts between page space and the pixels of one render. */
export interface PageRenderTransform {
  /** The image's width in pixels. */
  readonly width: number;
  /** The image's height in pixels. */
  readonly height: number;
  /** Page space to pixels. */
  readonly matrix: PageRenderMatrix;
  // Most specific first: a box is also shaped like a point.
  /** Where a point, a box or a quad of the page lands in the image. */
  pageToPixels(quad: PageQuad): PixelQuad;
  pageToPixels(box: PageBox): PixelBox;
  pageToPixels(point: PagePoint): PixelPoint;
  /** The page point or box under a point or a box of the image. */
  pixelsToPage(box: PixelBox): PageBox;
  pixelsToPage(point: PixelPoint): PagePoint;
}

/** The settings a render is made with that decide where its pixels are. */
export interface PageTransformOptions {
  viewport?: PageRenderViewport;
  rotation?: PdfRotation;
  target?: PageRenderTarget;
}

/**
 * The transform of the image a render with `options` makes of `page`, without
 * rendering: its size, rounding included, and the conversion between page
 * space and its pixels. Takes the page's layout (`doc.pages.list()`).
 * `InvalidArg` for a viewport that isn't positive or a target without area.
 */
export function pageTransform(
  page: { size: PdfSize },
  options: PageTransformOptions = {},
): PageRenderTransform {
  const target = options.target;
  return renderAreaTransform(
    target?.kind === 'rect'
      ? renderTargetArea(target.rect)
      : { x: 0, y: 0, width: page.size.width, height: page.size.height },
    options,
  );
}

/** The transform of a render of `area` with `options`' turn and size. */
export function renderAreaTransform(
  area: PageBox,
  options: Pick<PageTransformOptions, 'viewport' | 'rotation'>,
): PageRenderTransform {
  const rotation = options.rotation ?? 0;
  const { width, height } = renderSize(area, rotation, options.viewport ?? { kind: 'scale' });
  return renderTransform(area, rotation, width, height);
}

/**
 * A render target's area with its sides in order, as the renderer takes it.
 * `InvalidArg` for a rect without area, or one that isn't numbers.
 */
export function renderTargetArea(rect: PageBox): PageBox {
  const { x, y, width, height } = rect;
  if (![x, y, width, height].every(Number.isFinite) || width === 0 || height === 0) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'render rect must have positive area');
  }
  return {
    x: Math.min(x, x + width),
    y: Math.min(y, y + height),
    width: Math.abs(width),
    height: Math.abs(height),
  };
}

/**
 * The matrix that draws `area` of the page, turned clockwise by `rotation`,
 * onto `width` × `height` pixels. The renderer draws with it.
 */
export function renderMatrix(
  area: PageBox,
  rotation: PdfRotation,
  width: number,
  height: number,
): PageRenderMatrix {
  const { x, y } = area;
  const w = area.width;
  const h = area.height;
  switch (rotation) {
    case 0:
      return [width / w, 0, 0, height / h, (-width / w) * x, (-height / h) * y];
    case 90:
      return [0, height / w, -width / h, 0, (width / h) * (y + h), (-height / w) * x];
    case 180:
      return [-width / w, 0, 0, -height / h, (width / w) * (x + w), (height / h) * (y + h)];
    case 270:
      return [0, -height / w, width / h, 0, (-width / h) * y, (height / w) * (x + w)];
  }
}

/** The transform of a render of `area`, turned by `rotation`, drawn onto `width` × `height` pixels. */
export function renderTransform(
  area: PageBox,
  rotation: PdfRotation,
  width: number,
  height: number,
): PageRenderTransform {
  const matrix = renderMatrix(area, rotation, width, height);
  const inverse = inverseOf(matrix);
  return {
    width,
    height,
    matrix,
    pageToPixels: ((value: PagePoint | PageBox | PageQuad) =>
      mapped(matrix, value)) as PageRenderTransform['pageToPixels'],
    pixelsToPage: ((value: PixelPoint | PixelBox) =>
      mapped(inverse, value)) as PageRenderTransform['pixelsToPage'],
  };
}

function inverseOf([a, b, c, d, e, f]: PageRenderMatrix): PageRenderMatrix {
  const det = a * d - b * c;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

function mappedPoint(m: PageRenderMatrix, { x, y }: PagePoint): PagePoint {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

/** A point, a box or a quad through `m`. A box stays a box: every turn is a quarter turn. */
function mapped(
  m: PageRenderMatrix,
  value: PagePoint | PageBox | PageQuad,
): PagePoint | PageBox | PageQuad {
  if ('upperLeft' in value) {
    return {
      upperLeft: mappedPoint(m, value.upperLeft),
      upperRight: mappedPoint(m, value.upperRight),
      lowerLeft: mappedPoint(m, value.lowerLeft),
      lowerRight: mappedPoint(m, value.lowerRight),
    };
  }
  if ('width' in value) {
    const from = mappedPoint(m, value);
    const to = mappedPoint(m, { x: value.x + value.width, y: value.y + value.height });
    return {
      x: Math.min(from.x, to.x),
      y: Math.min(from.y, to.y),
      width: Math.abs(to.x - from.x),
      height: Math.abs(to.y - from.y),
    };
  }
  return mappedPoint(m, value);
}
