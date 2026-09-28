import { describe, expect, test } from 'vitest';

import type {
  PageGeometryGlyph,
  PageGeometryRun,
  PageGeometrySnapshot,
  RotatedGeometryGlyph,
} from '../../src/dto/PageGeometrySnapshot';
import { pageBoxOf, pagePointOf, pageQuadOf } from '../../src/geometry/pageSpace';
import type { PdfPoint, PdfRect } from '../../src/geometry/primitives';
import { toPageRef } from '../../src/identity/PageRef';
import {
  createPageTextLayout,
  pageGeometryOf,
  pageSearchSliceOf,
  pageTextSegmentOf,
} from '../../src/pageSpace/text';
import { createTextLayout } from '../../src/text/layout';

const visible: PdfRect = { left: 50, bottom: 60, right: 562, top: 732 };

const upright = (start: number, x: number, bottom: number, count: number): PageGeometryRun => {
  const glyphs: PageGeometryGlyph[] = Array.from({ length: count }, (_, i) => ({
    loose: { left: x + i * 10, right: x + i * 10 + 10, bottom, top: bottom + 12 },
    ...(i === 3 ? { space: true as const } : {}),
  }));
  return {
    rect: { left: x, right: x + count * 10, bottom, top: bottom + 12 },
    start,
    glyphs,
  };
};

/** A run along a baseline `u` with ascent `n`, starting at `origin`. */
const oriented = (
  start: number,
  origin: PdfPoint,
  u: PdfPoint,
  n: PdfPoint,
  rotation: number,
  ascentFlip = false,
): PageGeometryRun => {
  const at = (t: number, up: number): PdfPoint => ({
    x: origin.x + u.x * t + n.x * up,
    y: origin.y + u.y * t + n.y * up,
  });
  const glyphs: RotatedGeometryGlyph[] = Array.from({ length: 4 }, (_, i) => ({
    loose: { p1: at(i * 8, 12), p2: at(i * 8 + 8, 12), p3: at(i * 8, 0), p4: at(i * 8 + 8, 0) },
  }));
  const corners = glyphs.flatMap((g) => [g.loose.p1, g.loose.p2, g.loose.p3, g.loose.p4]);
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const rect: PdfRect = {
    left: Math.min(...xs),
    right: Math.max(...xs),
    bottom: Math.min(...ys),
    top: Math.max(...ys),
  };
  return { rect, start, glyphs, rotation, ascentFlip };
};

const s = Math.SQRT1_2;
const snapshot: PageGeometrySnapshot = {
  runs: [
    upright(0, 100, 600, 8),
    upright(8, 100, 580, 6),
    oriented(14, { x: 300, y: 300 }, { x: 0, y: 1 }, { x: -1, y: 0 }, 270),
    oriented(18, { x: 400, y: 200 }, { x: s, y: -s }, { x: s, y: s }, 45),
    oriented(22, { x: 200, y: 150 }, { x: 1, y: 0 }, { x: 0, y: -1 }, 0, true),
  ],
};

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

describe('text in page space', () => {
  const pdfLayout = createTextLayout(snapshot);
  const pageSnapshot = pageGeometryOf(snapshot, visible);
  const pageLayout = createPageTextLayout(pageSnapshot);

  test('the geometry is measured from the top-left of the visible box', () => {
    expect(pageSnapshot.runs[0]!.rect).toEqual({ x: 50, y: 120, width: 80, height: 12 });
    expect(pageSnapshot.runs[0]!.glyphs[3]).toEqual({
      loose: { x: 80, y: 120, width: 10, height: 12 },
      space: true,
    });
    const turned = snapshot.runs[2]! as Extract<PageGeometryRun, { rotation: number }>;
    expect(pageSnapshot.runs[2]).toMatchObject({ rotation: 270, ascentFlip: false });
    expect((pageSnapshot.runs[2]!.glyphs[0] as { loose: unknown }).loose).toEqual(
      pageQuadOf(turned.glyphs[0]!.loose, visible),
    );
  });

  test('every answer is the file-coordinates answer, measured on the page', () => {
    expect(pageLayout.charCount).toBe(pdfLayout.charCount);
    for (let x = 60; x < 560; x += 13) {
      for (let y = 70; y < 730; y += 11) {
        const point = { x, y };
        const page = pagePointOf(point, visible);
        expect(pageLayout.charAt(page)).toBe(pdfLayout.charAt(point));
        expect(pageLayout.wordAt(page)).toEqual(pdfLayout.wordAt(point));
        expect(pageLayout.lineAt(page)).toEqual(pdfLayout.lineAt(point));
      }
    }
    for (let start = 0; start < pdfLayout.charCount; start++) {
      for (const count of [1, 3, 9, 26]) {
        const range = { start, count: Math.min(count, pdfLayout.charCount - start) };
        close(
          pageLayout.segments(range),
          pdfLayout.segments(range).map((segment) => pageTextSegmentOf(segment, visible)),
        );
      }
      const quad = pdfLayout.charQuad(start);
      close(pageLayout.charQuad(start), quad && pageQuadOf(quad, visible));
    }
  });

  test('a search batch measures each match on its own page', () => {
    const other = { left: 0, bottom: 0, right: 612, top: 792 };
    const pdfSegment = {
      quad: { p1: { x: 0, y: 12 }, p2: { x: 10, y: 12 }, p3: { x: 0, y: 0 }, p4: { x: 10, y: 0 } },
      rect: { left: 0, bottom: 0, right: 10, top: 12 },
      advance: 1 as const,
    };
    const slice = pageSearchSliceOf(
      {
        matches: [
          { page: toPageRef(4), start: 0, count: 1, segments: [pdfSegment] },
          { page: toPageRef(6), start: 0, count: 1, segments: [pdfSegment] },
        ],
        nextCursor: null,
        pagesSearched: 2,
        pageCount: 2,
      },
      (page) => (page.pageObjectNumber === 4 ? visible : other),
    );
    expect(slice.matches[0]!.segments[0]!.rect).toEqual(pageBoxOf(pdfSegment.rect, visible));
    expect(slice.matches[1]!.segments[0]!.rect).toEqual({ x: 0, y: 780, width: 10, height: 12 });
  });
});
