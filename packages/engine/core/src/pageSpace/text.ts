import type { PageCoordinates } from './coordinates';
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
} from '../geometry/pageSpace';
import type { PdfRect } from '../geometry/primitives';
import type { SearchMatch, SearchSlice } from '../search/types';
import { createTextLayout, type PdfTextSegment, type TextLayout } from '../text/layout';

/** A page's text geometry in page space. `visible` is the page's visible box. */
export function pageGeometryOf(
  snapshot: PageGeometrySnapshot,
  visible: PdfRect,
): PageGeometrySnapshot<PageCoordinates> {
  return {
    ...snapshot,
    runs: snapshot.runs.map((run): PageGeometryRun<PageCoordinates> => {
      const rect = pageBoxOf(run.rect, visible);
      if (isRotatedGeometryRun(run)) {
        return {
          ...run,
          rect,
          glyphs: run.glyphs.map(({ loose, tight, ...glyph }) => ({
            ...glyph,
            loose: pageQuadOf(loose, visible),
            ...(tight ? { tight: pageQuadOf(tight, visible) } : {}),
          })),
        };
      }
      return {
        ...run,
        rect,
        glyphs: run.glyphs.map(({ loose, tight, ...glyph }) => ({
          ...glyph,
          loose: pageBoxOf(loose, visible),
          ...(tight ? { tight: pageBoxOf(tight, visible) } : {}),
        })),
      };
    }),
  };
}

export function pageTextSegmentOf(
  segment: PdfTextSegment,
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
  slice: SearchSlice,
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

/** A page-space geometry snapshot flipped top to bottom, for the text layout's y-up math. */
function mirroredGeometry(snapshot: PageGeometrySnapshot<PageCoordinates>): PageGeometrySnapshot {
  return {
    ...snapshot,
    runs: snapshot.runs.map((run): PageGeometryRun => {
      const rect = mirroredRect(run.rect);
      if (isRotatedGeometryRun(run)) {
        return {
          ...run,
          rect,
          glyphs: run.glyphs.map(({ loose, tight, ...glyph }) => ({
            ...glyph,
            loose: mirroredQuad(loose),
            ...(tight ? { tight: mirroredQuad(tight) } : {}),
          })),
        };
      }
      return {
        ...run,
        rect,
        glyphs: run.glyphs.map(({ loose, tight, ...glyph }) => ({
          ...glyph,
          loose: mirroredRect(loose),
          ...(tight ? { tight: mirroredRect(tight) } : {}),
        })),
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
export function createPageTextLayout(
  snapshot: PageGeometrySnapshot<PageCoordinates>,
): TextLayout<PageCoordinates> {
  const layout = createTextLayout(mirroredGeometry(snapshot));
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
