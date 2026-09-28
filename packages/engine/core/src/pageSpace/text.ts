import type { PageCoordinates, PdfCoordinates } from './coordinates';
import type { VisibleBoxOf } from './destinations';
import {
  isRotatedGeometryRun,
  type PageGeometryRun,
  type PageGeometrySnapshot,
} from '../dto/PageGeometrySnapshot';
import {
  mirroredPoint,
  mirroredQuad,
  mirroredRect,
  pageBoxOf,
  pageQuadOf,
  unmirroredBox,
  unmirroredQuad,
  type PageBox,
} from '../geometry/pageSpace';
import type { PdfRect } from '../geometry/primitives';
import type { SearchMatch, SearchSlice } from '../search/types';
import { createPdfTextLayout, type PdfTextSegment, type TextLayout } from '../text/layout';

/**
 * A character with no box of its own (`empty`) carries a zeroed box or quad
 * that says so, in either space, and so does a run of nothing but such
 * characters; it is not a place, so it never converts.
 */
const NO_BOX: PageBox = { x: 0, y: 0, width: 0, height: 0 };
const NO_RECT: PdfRect = { left: 0, bottom: 0, right: 0, top: 0 };
const NO_QUAD = { p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 }, p3: { x: 0, y: 0 }, p4: { x: 0, y: 0 } };

/** Whether a run has a character with a box of its own. */
const hasBox = (run: { glyphs: readonly { empty?: true }[] }): boolean =>
  run.glyphs.some((glyph) => !glyph.empty);

/** A page's text geometry in page space. `visible` is the page's visible box. */
export function pageGeometryOf(
  snapshot: PageGeometrySnapshot<PdfCoordinates>,
  visible: PdfRect,
): PageGeometrySnapshot<PageCoordinates> {
  return {
    ...snapshot,
    runs: snapshot.runs.map((run): PageGeometryRun<PageCoordinates> => {
      const rect = hasBox(run) ? pageBoxOf(run.rect, visible) : NO_BOX;
      if (isRotatedGeometryRun(run)) {
        return {
          ...run,
          rect,
          glyphs: run.glyphs.map(({ loose, tight, ...glyph }) => ({
            ...glyph,
            loose: glyph.empty ? NO_QUAD : pageQuadOf(loose, visible),
            ...(tight ? { tight: pageQuadOf(tight, visible) } : {}),
          })),
        };
      }
      return {
        ...run,
        rect,
        glyphs: run.glyphs.map(({ loose, tight, ...glyph }) => ({
          ...glyph,
          loose: glyph.empty ? NO_BOX : pageBoxOf(loose, visible),
          ...(tight ? { tight: pageBoxOf(tight, visible) } : {}),
        })),
      };
    }),
  };
}

/** A page-space run flipped top to bottom, for the y-up math of the text layout and its helpers. */
export function mirroredRun(
  run: PageGeometryRun<PageCoordinates>,
): PageGeometryRun<PdfCoordinates> {
  const rect = hasBox(run) ? mirroredRect(run.rect) : NO_RECT;
  if (isRotatedGeometryRun(run)) {
    return {
      ...run,
      rect,
      glyphs: run.glyphs.map(({ loose, tight, ...glyph }) => ({
        ...glyph,
        loose: glyph.empty ? NO_QUAD : mirroredQuad(loose),
        ...(tight ? { tight: mirroredQuad(tight) } : {}),
      })),
    };
  }
  return {
    ...run,
    rect,
    glyphs: run.glyphs.map(({ loose, tight, ...glyph }) => ({
      ...glyph,
      loose: glyph.empty ? NO_RECT : mirroredRect(loose),
      ...(tight ? { tight: mirroredRect(tight) } : {}),
    })),
  };
}

export function pageTextSegmentOf(
  segment: PdfTextSegment<PdfCoordinates>,
  visible: PdfRect,
): PdfTextSegment<PageCoordinates> {
  return {
    ...segment,
    quad: pageQuadOf(segment.quad, visible),
    rect: pageBoxOf(segment.rect, visible),
  };
}

/** A search batch in page space: each match measured on its own page. */
export function pageSearchSliceOf(
  slice: SearchSlice<PdfCoordinates>,
  boxOf: VisibleBoxOf,
): SearchSlice<PageCoordinates> {
  return {
    ...slice,
    matches: slice.matches.map((match): SearchMatch<PageCoordinates> => {
      const visible = boxOf(match.page);
      return {
        ...match,
        segments: match.segments.map((segment) => pageTextSegmentOf(segment, visible)),
      };
    }),
  };
}

/**
 * The layout of a page's text geometry in page space. It runs the same
 * layout as the file's coordinates do, on the geometry flipped top to bottom,
 * and flips each answer back: the flip is exact and the layout doesn't depend
 * on where the origin is.
 */
export function createTextLayout(snapshot: PageGeometrySnapshot): TextLayout {
  const layout = createPdfTextLayout({ ...snapshot, runs: snapshot.runs.map(mirroredRun) });
  const at = (value: { x: number; y: number } | number) =>
    typeof value === 'number' ? value : mirroredPoint(value);
  return {
    charCount: layout.charCount,
    runs: snapshot.runs,
    charAt: (point) => layout.charAt(mirroredPoint(point)),
    wordAt: (value) => layout.wordAt(at(value)),
    lineAt: (value) => layout.lineAt(at(value)),
    segments: (range) =>
      layout.segments(range).map((segment) => ({
        ...segment,
        quad: unmirroredQuad(segment.quad),
        rect: unmirroredBox(segment.rect),
      })),
    charQuad: (index) => {
      const quad = layout.charQuad(index);
      return quad ? unmirroredQuad(quad) : null;
    },
  };
}
