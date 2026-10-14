import type { PageDestination, PdfDestination } from '../dto/PdfDestination';
import type { PageBox, PagePoint, PageQuad } from '../geometry/pageSpace';
import type { PdfPoint, PdfQuad, PdfRect } from '../geometry/primitives';

/**
 * The types a value's positions take, for a type that exists in both spaces
 * (`TextLayout<PageCoordinates>`): the file's coordinates or page space.
 */
export interface Coordinates {
  point: { x: number; y: number };
  box: object;
  quad: object;
  destination: object;
}

export interface PdfCoordinates extends Coordinates {
  point: PdfPoint;
  box: PdfRect;
  quad: PdfQuad;
  destination: PdfDestination;
}

export interface PageCoordinates extends Coordinates {
  point: PagePoint;
  box: PageBox;
  quad: PageQuad;
  destination: PageDestination;
}
