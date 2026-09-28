import { describe, expect, test } from 'vitest';

import { appearanceTurnOf } from '../../src/annotation/appearanceTurn';
import { drawnPointsOf } from '../../src/annotation/drawnPoints';
import type { AnnotationDTO, PageAnnotationDTO } from '../../src/annotation/kinds';
import type { PdfViewport } from '../../src/dto/Measure';
import {
  glyphLooseBounds,
  glyphLooseQuad,
  type PageGeometryRun,
} from '../../src/dto/PageGeometrySnapshot';
import { pdfQuadBounds, pdfQuadCorners, pdfRectTurnedBounds } from '../../src/geometry/convert';
import { pageBoxOf, pagePointOf, pageQuadOf, type PagePoint } from '../../src/geometry/pageSpace';
import {
  pdfPointsBounds,
  pdfPointTurned,
  pdfTurnOfDrawn,
  pdfTurnOfUpright,
} from '../../src/geometry/pointTurn';
import type { PdfPoint, PdfRect } from '../../src/geometry/primitives';
import { viewportForPoint } from '../../src/measure/viewport';
import { pageAnnotationOf } from '../../src/pageSpace/annotations';
import {
  pageAppearanceTurnOf,
  pageDrawnPointsOf,
  pageGlyphLooseBounds,
  pageGlyphLooseQuad,
  pagePointsBounds,
  pagePointTurned,
  pageQuadBounds,
  pageQuadCorners,
  pageTurnOfDrawn,
  pageTurnOfUpright,
  pageViewportForPoint,
} from '../../src/pageSpace/helpers';
import { pageGeometryOf } from '../../src/pageSpace/text';

const visible: PdfRect = { left: -306, bottom: -396, right: 306, top: 396 };
const toPage = (point: PdfPoint) => pagePointOf(point, visible);
const boxOf = () => visible;

function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}
const next = random(7);
const coordinate = () => (next() - 0.5) * 600;
const pointAt = (): PdfPoint => ({ x: coordinate(), y: coordinate() });

const close = (actual: unknown, expected: unknown) => {
  const flat = (value: unknown): number[] =>
    typeof value === 'number'
      ? [value]
      : value && typeof value === 'object'
        ? Object.values(value).flatMap(flat)
        : [];
  const [a, b] = [flat(actual), flat(expected)];
  expect(a.length).toBe(b.length);
  a.forEach((value, i) => expect(value).toBeCloseTo(b[i]!, 9));
};

describe('page-space helpers agree with the originals', () => {
  test('a clockwise turn looks clockwise: right of the middle turns to below it', () => {
    const turned = pagePointTurned({ x: 10, y: 0 }, { degrees: 90, center: { x: 0, y: 0 } });
    close(turned, { x: 0, y: 10 });
  });

  test('turns', () => {
    for (let n = 0; n < 200; n++) {
      const point = pointAt();
      const center = pointAt();
      const degrees = next() * 720 - 360;
      close(
        pagePointTurned(toPage(point), { degrees, center: toPage(center) }),
        toPage(pdfPointTurned(point, { degrees, center })),
      );
      const points = [pointAt(), pointAt(), pointAt()];
      const upright = pdfTurnOfUpright(points, degrees);
      close(pageTurnOfUpright(points.map(toPage), degrees), {
        degrees,
        center: toPage(upright.center),
      });
      const drawn = pdfTurnOfDrawn(points, degrees);
      close(pageTurnOfDrawn(points.map(toPage), degrees), {
        degrees,
        center: toPage(drawn.center),
      });
    }
  });

  test('bounds and corners', () => {
    for (let n = 0; n < 100; n++) {
      const points = [pointAt(), pointAt(), pointAt(), pointAt()];
      close(pagePointsBounds(points.map(toPage)), pageBoxOf(pdfPointsBounds(points), visible));
      const quad = { p1: points[0]!, p2: points[1]!, p3: points[2]!, p4: points[3]! };
      close(pageQuadBounds(pageQuadOf(quad, visible)), pageBoxOf(pdfQuadBounds(quad), visible));
      const corners = pdfQuadCorners(quad);
      close(pageQuadCorners(pageQuadOf(quad, visible)), {
        topLeft: toPage(corners.topLeft),
        topRight: toPage(corners.topRight),
        bottomLeft: toPage(corners.bottomLeft),
        bottomRight: toPage(corners.bottomRight),
      });
    }
  });

  test('glyph cells, upright and turned', () => {
    const upright: PageGeometryRun = {
      rect: { left: 10, bottom: 100, right: 40, top: 112 },
      start: 0,
      glyphs: [{ loose: { left: 10, bottom: 100, right: 20, top: 112 } }],
    };
    const turned: PageGeometryRun = {
      rect: { left: 0, bottom: 0, right: 20, top: 20 },
      start: 1,
      rotation: 315,
      ascentFlip: false,
      glyphs: [
        {
          loose: {
            p1: { x: 0, y: 10 },
            p2: { x: 10, y: 20 },
            p3: { x: 10, y: 0 },
            p4: { x: 20, y: 10 },
          },
        },
      ],
    };
    const snapshot = pageGeometryOf({ runs: [upright, turned] }, visible);
    for (const [i, run] of [upright, turned].entries()) {
      close(pageGlyphLooseQuad(snapshot.runs[i]!, 0), pageQuadOf(glyphLooseQuad(run, 0), visible));
      close(
        pageGlyphLooseBounds(snapshot.runs[i]!, 0),
        pageBoxOf(glyphLooseBounds(run, 0), visible),
      );
    }
  });

  test('drawn points of a turned line, polygon and ink', () => {
    const cases = [
      { subtype: 'line', rotation: 30, linePoints: { start: pointAt(), end: pointAt() } },
      { subtype: 'polygon', rotation: -45, vertices: [pointAt(), pointAt(), pointAt()] },
      { subtype: 'ink', rotation: 120, inkList: [[pointAt(), pointAt()], [pointAt()]] },
      { subtype: 'polyline', rotation: null, vertices: [pointAt(), pointAt()] },
    ];
    for (const annotation of cases) {
      const dto = annotation as unknown as AnnotationDTO;
      const page = pageAnnotationOf(dto, visible, boxOf) as PageAnnotationDTO;
      const expected = drawnPointsOf(dto)!.map((set) => set.map(toPage));
      close(pageDrawnPointsOf(page), expected);
    }
    expect(pageDrawnPointsOf({ subtype: 'square' } as PageAnnotationDTO)).toBeNull();
  });

  test('the appearance turn', () => {
    const box = { left: 100, bottom: 100, right: 200, top: 150 };
    for (const rotation of [0, 30, 90, 200]) {
      const rect = rotation ? pdfRectTurnedBounds(box, rotation) : box;
      const annotation = { subtype: 'square', rect, box, rotation };
      expect(
        pageAppearanceTurnOf({
          ...annotation,
          rect: pageBoxOf(rect, visible),
          box: pageBoxOf(box, visible),
        }),
      ).toBe(appearanceTurnOf(annotation));
    }
  });

  test('the viewport under a point', () => {
    const viewports: PdfViewport[] = [
      { bbox: { left: -300, bottom: -300, right: 0, top: 0 }, name: 'a', measure: null },
      { bbox: { left: -100, bottom: -100, right: 200, top: 200 }, name: 'b', measure: null },
    ];
    const pageViewports = viewports.map((viewport) => ({
      ...viewport,
      bbox: pageBoxOf(viewport.bbox, visible),
    }));
    for (let n = 0; n < 100; n++) {
      const point = pointAt();
      const found = viewportForPoint(viewports, point);
      const pageFound = pageViewportForPoint(pageViewports, toPage(point) as PagePoint);
      expect(pageFound?.name).toBe(found?.name);
    }
  });
});
