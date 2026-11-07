/**
 * Where the bars floating on one row over the pages go, so that none covers
 * another. A row is the three positions along the top edge, the three along
 * the bottom edge, or the middles of the two sides. On an edge, the corner
 * bars sit in the corners and the middle one stays centered over the pages,
 * moving aside only as far as a corner bar needs; when it doesn't fit beside
 * them, it keeps the edge and the corner bars move one row in, toward the
 * middle of the pages.
 * Two corner bars that don't fit side by side stack the same way, the end one
 * further in. On the sides, the start bar and the end bar stay level until
 * they would meet, and then sit one over the other, the start one on top.
 *
 * Each position's bars are a column: as wide as its widest bar, as tall as
 * its bars and the gaps between them.
 */
import type { FloatPosition } from '@embedpdf/core-ui';

/** The positions of one row: its two ends, and its middle (none on the sides). */
export interface FloatingRowPositions {
  readonly start: FloatPosition;
  readonly middle: FloatPosition | null;
  readonly end: FloatPosition;
}

/** The rows of floating positions: the top edge, the middles of the sides, and the bottom edge. */
export const FLOATING_ROWS = {
  top: { start: 'top-start', middle: 'top', end: 'top-end' },
  sides: { start: 'start', middle: null, end: 'end' },
  bottom: { start: 'bottom-start', middle: 'bottom', end: 'bottom-end' },
} as const satisfies Readonly<Record<string, FloatingRowPositions>>;

export type FloatingRowName = keyof typeof FLOATING_ROWS;

/** What one position's bars take up: the widest bar, and the column's height, in px. */
export interface FloatingColumn {
  readonly width: number;
  readonly height: number;
}

/** Where one position's column goes in its row. */
export interface FloatingSpot {
  /** Its lane, as px in from the row's start edge and from its end edge. */
  readonly insetStart: number;
  readonly insetEnd: number;
  /**
   * Px it moves off its line: on an edge, in toward the middle of the pages; on the sides, the
   * room it leaves for the other column (below the start one, above the end one).
   */
  readonly offset: number;
}

export interface FloatingRowInput {
  /** The row's length, in px. */
  readonly length: number;
  /** Px between two columns that share the row, or stack. */
  readonly gap: number;
  /** Each position's column; `null` (or nothing drawn) for a position with no bar showing. */
  readonly start: FloatingColumn | null;
  readonly middle: FloatingColumn | null;
  readonly end: FloatingColumn | null;
}

export interface FloatingRowSpots {
  readonly start: FloatingSpot;
  readonly middle: FloatingSpot;
  readonly end: FloatingSpot;
}

const AT_REST: FloatingSpot = { insetStart: 0, insetEnd: 0, offset: 0 };

/** Whether a column has a bar to show: nothing drawn takes no room. */
const isDrawn = (column: FloatingColumn | null): column is FloatingColumn =>
  column !== null && column.width > 0;

/**
 * The middle column's lane in a row it shares with the corner columns: centered on where the
 * column goes, as wide as the room beside the corner columns allows on both sides, so it draws
 * centered there and never gets less room than it takes. `null` when it doesn't fit beside them.
 */
function middleLaneOf(
  length: number,
  width: number,
  besideStart: number,
  besideEnd: number,
): FloatingSpot | null {
  const first = besideStart + width / 2;
  const last = length - besideEnd - width / 2;
  if (first > last) return null;
  const center = Math.min(Math.max(length / 2, first), last);
  const half = Math.min(center - besideStart, length - besideEnd - center);
  return { insetStart: center - half, insetEnd: length - center - half, offset: 0 };
}

/** Where each column of an edge's row goes: see the module comment. */
export function arrangeEdgeRow({
  length,
  gap,
  start,
  middle,
  end,
}: FloatingRowInput): FloatingRowSpots {
  const besideStart = isDrawn(start) ? start.width + gap : 0;
  const besideEnd = isDrawn(end) ? end.width + gap : 0;
  const lane = isDrawn(middle) ? middleLaneOf(length, middle.width, besideStart, besideEnd) : null;
  // The corner bars move in past the middle one when it keeps the edge alone.
  const inward = isDrawn(middle) && lane === null ? middle.height + gap : 0;
  const cornersMeet = isDrawn(start) && isDrawn(end) && start.width + gap + end.width > length;
  return {
    start: { ...AT_REST, offset: inward },
    middle: lane ?? AT_REST,
    end: { ...AT_REST, offset: inward + (cornersMeet ? start.height + gap : 0) },
  };
}

/** Where the start and end columns of the sides go: see the module comment. */
export function arrangeSideRow({ length, gap, start, end }: FloatingRowInput): FloatingRowSpots {
  const meet = isDrawn(start) && isDrawn(end) && start.width + gap + end.width > length;
  if (!meet) return { start: AT_REST, middle: AT_REST, end: AT_REST };
  return {
    start: { ...AT_REST, offset: end.height + gap },
    middle: AT_REST,
    end: { ...AT_REST, offset: start.height + gap },
  };
}
