/**
 * Page-space shapes in a page layer's pixels. Every layer over a page (the
 * annotation, form, link, selection and search layers) gets boxes and quads
 * in page points and places its elements in the page layer's own pixels,
 * always through the page's `toPixels`: never by multiplying with a scale of
 * its own. Plain geometry over structural shapes, the same for every
 * framework adapter.
 */

/** A point in page points or in pixels. */
export interface PagePoint {
  x: number;
  y: number;
}

/** What a page layer converts with: its transform's `toPixels`. */
export interface PageToPixels {
  toPixels(point: PagePoint): PagePoint;
}

/** A box in a page layer's pixels, the shape a positioned element takes. */
export interface PixelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A quad's four corners, as the engine names them. */
export interface PageQuad {
  upperLeft: PagePoint;
  upperRight: PagePoint;
  lowerRight: PagePoint;
  lowerLeft: PagePoint;
}

/** A box in page points as a box in the page layer's pixels. */
export function rectInPixels(
  rect: { x: number; y: number; width: number; height: number },
  page: PageToPixels,
): PixelRect {
  const topLeft = page.toPixels({ x: rect.x, y: rect.y });
  const bottomRight = page.toPixels({ x: rect.x + rect.width, y: rect.y + rect.height });
  return {
    left: topLeft.x,
    top: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
}

/**
 * A quad's corners in the page layer's pixels, in drawing order (upper left,
 * upper right, lower right, lower left). The map is affine, so mapping the
 * corners is exact, for turned text too.
 */
export function quadInPixels(quad: PageQuad, page: PageToPixels): PagePoint[] {
  return [quad.upperLeft, quad.upperRight, quad.lowerRight, quad.lowerLeft].map((point) =>
    page.toPixels(point),
  );
}

/** Points as an SVG `points` attribute: `"x,y x,y …"`. */
export function svgPoints(points: readonly PagePoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

/** Whether a quad is an upright box: drawn as a positioned box instead of a polygon. */
export function isUprightQuad(quad: PageQuad): boolean {
  return (
    quad.upperLeft.y === quad.upperRight.y &&
    quad.lowerLeft.y === quad.lowerRight.y &&
    quad.upperLeft.x === quad.lowerLeft.x
  );
}
