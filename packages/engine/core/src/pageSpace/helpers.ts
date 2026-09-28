/**
 * The engine's geometry helpers, for page-space values. Each flips its
 * values top to bottom, runs the helper written for the file's coordinates
 * (y up), and flips the answer back: exact, and needing no page box, since
 * none of that math depends on where the origin is.
 */

import type { PageCoordinates } from './coordinates';
import { mirroredRun } from './text';
import { appearanceTurnOf } from '../annotation/appearanceTurn';
import { drawnPointsOf } from '../annotation/drawnPoints';
import type { AnnotationDTO, PageAnnotationDTO } from '../annotation/kinds';
import type { PdfViewport } from '../dto/Measure';
import {
  glyphLooseBounds,
  glyphLooseQuad,
  type PageGeometryRun,
} from '../dto/PageGeometrySnapshot';
import { isRotatedGeometryRun } from '../dto/PageGeometrySnapshot';
import { pdfQuadBounds, pdfQuadCorners } from '../geometry/convert';
import {
  mirroredPoint,
  mirroredQuad,
  mirroredRect,
  unmirroredBox,
  unmirroredPoint,
  unmirroredQuad,
  type PageBox,
  type PagePoint,
  type PageQuad,
} from '../geometry/pageSpace';
import {
  pdfPointsBounds,
  pdfPointTurned,
  pdfPointUnturned,
  pdfTurnOfDrawn,
  pdfTurnOfUpright,
  type PdfPointTurn,
} from '../geometry/pointTurn';
import { viewportForPoint } from '../measure/viewport';

/** A turn in page space: degrees clockwise, as the page shows it, about `center`. */
export interface PagePointTurn {
  degrees: number;
  center: PagePoint;
}

const mirroredTurn = (turn: PagePointTurn): PdfPointTurn => ({
  degrees: turn.degrees,
  center: mirroredPoint(turn.center),
});

const unmirroredTurn = (turn: PdfPointTurn): PagePointTurn => ({
  degrees: turn.degrees,
  center: unmirroredPoint(turn.center),
});

/** The box around `points`; a zero box at the origin when there are none. */
export const pagePointsBounds = (points: readonly PagePoint[]): PageBox =>
  unmirroredBox(pdfPointsBounds(points.map(mirroredPoint)));

/** `point` turned by `turn`; a negative angle turns it back. */
export const pagePointTurned = (point: PagePoint, turn: PagePointTurn): PagePoint =>
  unmirroredPoint(pdfPointTurned(mirroredPoint(point), mirroredTurn(turn)));

/** `point` turned back by `turn`. */
export const pagePointUnturned = (point: PagePoint, turn: PagePointTurn): PagePoint =>
  unmirroredPoint(pdfPointUnturned(mirroredPoint(point), mirroredTurn(turn)));

/** The turn that draws upright `points`: `degrees` about the middle of their box. */
export const pageTurnOfUpright = (points: readonly PagePoint[], degrees: number): PagePointTurn =>
  unmirroredTurn(pdfTurnOfUpright(points.map(mirroredPoint), degrees));

/** The turn drawn `points` were made with: `degrees` about the middle of their upright box. */
export const pageTurnOfDrawn = (points: readonly PagePoint[], degrees: number): PagePointTurn =>
  unmirroredTurn(pdfTurnOfDrawn(points.map(mirroredPoint), degrees));

/** The upright box around a quad, whatever its turn or skew. */
export const pageQuadBounds = (quad: PageQuad): PageBox =>
  unmirroredBox(pdfQuadBounds(mirroredQuad(quad)));

/** A quad's corners as the page shows them. Right only for an upright quad: see `pdfQuadCorners`. */
export function pageQuadCorners(quad: PageQuad): {
  topLeft: PagePoint;
  topRight: PagePoint;
  bottomLeft: PagePoint;
  bottomRight: PagePoint;
} {
  const corners = pdfQuadCorners(mirroredQuad(quad));
  return {
    topLeft: unmirroredPoint(corners.topLeft),
    topRight: unmirroredPoint(corners.topRight),
    bottomLeft: unmirroredPoint(corners.bottomLeft),
    bottomRight: unmirroredPoint(corners.bottomRight),
  };
}

/** A quad from the corners the page shows: `p1` top-left, `p2` top-right, `p3` bottom-left, `p4` bottom-right. */
export const pageQuadFromCorners = (corners: {
  topLeft: PagePoint;
  topRight: PagePoint;
  bottomLeft: PagePoint;
  bottomRight: PagePoint;
}): PageQuad => ({
  p1: corners.topLeft,
  p2: corners.topRight,
  p3: corners.bottomLeft,
  p4: corners.bottomRight,
});

/** A glyph's loose cell as a quad: `p1..p4` upper-start, upper-end, lower-start, lower-end. */
export const pageGlyphLooseQuad = (
  run: PageGeometryRun<PageCoordinates>,
  index: number,
): PageQuad => unmirroredQuad(glyphLooseQuad(mirroredRun(run), index));

/** A glyph's loose cell as an upright box. */
export const pageGlyphLooseBounds = (
  run: PageGeometryRun<PageCoordinates>,
  index: number,
): PageBox => unmirroredBox(glyphLooseBounds(mirroredRun(run), index));

/**
 * The points of a line, polyline, polygon or ink as the page shows them: the
 * upright points a read gives, turned by `rotation` about the middle of their
 * box. One list for a line (its two ends) or a polygon, one per ink stroke;
 * `null` for any other kind.
 */
export function pageDrawnPointsOf(annotation: PageAnnotationDTO): PagePoint[][] | null {
  const flip = (points: readonly PagePoint[]) => points.map(mirroredPoint);
  let mirrored: object;
  switch (annotation.subtype) {
    case 'line':
      mirrored = {
        subtype: 'line',
        rotation: annotation.rotation,
        linePoints: {
          start: mirroredPoint(annotation.linePoints.start),
          end: mirroredPoint(annotation.linePoints.end),
        },
      };
      break;
    case 'polyline':
    case 'polygon':
      mirrored = {
        subtype: annotation.subtype,
        rotation: annotation.rotation,
        vertices: flip(annotation.vertices),
      };
      break;
    case 'ink':
      mirrored = {
        subtype: 'ink',
        rotation: annotation.rotation,
        inkList: annotation.inkList.map(flip),
      };
      break;
    default:
      return null;
  }
  const sets = drawnPointsOf(mirrored as AnnotationDTO);
  return sets && sets.map((set) => set.map(unmirroredPoint));
}

/**
 * The turn an annotation's appearance raster is drawn without, or `null`
 * when the raster is drawn as the page shows it: see `appearanceTurnOf`.
 */
export const pageAppearanceTurnOf = (annotation: {
  subtype: string;
  rect: PageBox;
  box?: PageBox | null;
  rotation?: number | null;
  intent?: string | null;
}): number | null =>
  appearanceTurnOf({
    ...annotation,
    rect: mirroredRect(annotation.rect),
    box: annotation.box ? mirroredRect(annotation.box) : annotation.box,
  });

/** The last viewport whose box holds `point` (the one drawn on top), or `undefined`. */
export function pageViewportForPoint<Viewport extends PdfViewport<PageCoordinates>>(
  viewports: readonly Viewport[],
  point: PagePoint,
): Viewport | undefined {
  const mirrored = viewports.map((viewport) => ({
    ...viewport,
    bbox: mirroredRect(viewport.bbox),
  }));
  const found = viewportForPoint(mirrored, mirroredPoint(point));
  return found ? viewports[mirrored.indexOf(found)] : undefined;
}
