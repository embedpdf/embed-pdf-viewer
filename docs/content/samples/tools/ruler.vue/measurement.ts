import type { PageRef } from '@embedpdf/vue/runtime';

export interface Point {
  readonly x: number;
  readonly y: number;
}

// A line on one page, in page coordinates.
export interface Measurement {
  readonly page: PageRef;
  readonly from: Point;
  readonly to: Point;
}

// Page coordinates are points, 72 to the inch.
export const lengthOf = ({ from, to }: Measurement) => {
  const inches = Math.hypot(to.x - from.x, to.y - from.y) / 72;
  return `${inches.toFixed(2)} in · ${(inches * 2.54).toFixed(1)} cm`;
};
