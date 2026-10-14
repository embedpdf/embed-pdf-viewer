// A pin is a page and a point on it, in points from the page's top-left. No pixels.
export interface Pin {
  pageIndex: number;
  point: { x: number; y: number };
}
