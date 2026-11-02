/**
 * Where the bars floating on one row go: on an edge, the corner bars in the
 * corners and the middle one centered over the pages, moved aside only as far
 * as a corner bar needs, or the corner bars a row in when it doesn't fit
 * beside them; on the sides, level until they would meet, then one over the
 * other.
 */
import { describe, expect, it } from 'vitest';

import { FLOATING_ROWS, arrangeEdgeRow, arrangeSideRow } from '../../../chrome/src/ui/floating-row';

const AT_REST = { insetStart: 0, insetEnd: 0, offset: 0 };
const GAP = 8;

/** The pager and the zoom of the Layout page's example, on a phone 390 px wide. */
const PAGER = { width: 118, height: 40 };
const ZOOM = { width: 150, height: 40 };

describe('arrangeEdgeRow', () => {
  it('keeps every bar on the edge, and the middle one across it, with no corner bar', () => {
    expect(
      arrangeEdgeRow({ length: 350, gap: GAP, start: null, middle: PAGER, end: null }),
    ).toEqual({
      start: AT_REST,
      middle: AT_REST,
      end: AT_REST,
    });
  });

  it('keeps the middle bar centered while the corner bars leave it room on both sides', () => {
    /** Where the middle of a lane is, in from the row's start. */
    const middleOf = (spot: { insetStart: number; insetEnd: number }, length: number) =>
      spot.insetStart + (length - spot.insetStart - spot.insetEnd) / 2;
    const spots = arrangeEdgeRow({ length: 1060, gap: GAP, start: null, middle: PAGER, end: ZOOM });
    expect(middleOf(spots.middle, 1060)).toBe(530);
    // Its lane stays clear of the zoom, on both sides alike.
    expect(spots.middle.insetEnd).toBe(ZOOM.width + GAP);
    expect(spots.middle.insetStart).toBe(ZOOM.width + GAP);
    expect(spots.end).toEqual(AT_REST);
    const both = arrangeEdgeRow({ length: 600, gap: GAP, start: ZOOM, middle: PAGER, end: ZOOM });
    expect(middleOf(both.middle, 600)).toBe(300);
  });

  it('moves the middle bar aside only as far as a corner bar needs, in a lane centered on it', () => {
    const spots = arrangeEdgeRow({ length: 350, gap: GAP, start: null, middle: PAGER, end: ZOOM });
    // It ends a gap before the zoom: its lane is centered on it, as wide as fits on both sides.
    const right = 350 - ZOOM.width - GAP;
    const center = right - PAGER.width / 2;
    expect(spots.middle).toEqual({
      insetStart: center - PAGER.width / 2,
      insetEnd: 350 - right,
      offset: 0,
    });
    expect(spots.end).toEqual(AT_REST);
    // Never less room than it takes.
    expect(350 - spots.middle.insetStart - spots.middle.insetEnd).toBeGreaterThanOrEqual(
      PAGER.width,
    );
    const lopsided = arrangeEdgeRow({
      length: 400,
      gap: GAP,
      start: { width: 40, height: 40 },
      middle: PAGER,
      end: ZOOM,
    });
    const lane = 400 - lopsided.middle.insetStart - lopsided.middle.insetEnd;
    expect(lopsided.middle.insetStart + lane / 2).toBe(400 - ZOOM.width - GAP - PAGER.width / 2);
  });

  it('moves the corner bars a row in when the middle bar does not fit between them', () => {
    const spots = arrangeEdgeRow({ length: 250, gap: GAP, start: null, middle: PAGER, end: ZOOM });
    expect(spots.middle).toEqual(AT_REST);
    expect(spots.end).toEqual({ ...AT_REST, offset: PAGER.height + GAP });
    expect(spots.start).toEqual({ ...AT_REST, offset: PAGER.height + GAP });
  });

  it('stacks two corner bars that do not fit side by side, the end one further in', () => {
    const spots = arrangeEdgeRow({ length: 250, gap: GAP, start: ZOOM, middle: null, end: ZOOM });
    expect(spots.start).toEqual(AT_REST);
    expect(spots.end).toEqual({ ...AT_REST, offset: ZOOM.height + GAP });
    const withMiddle = arrangeEdgeRow({
      length: 250,
      gap: GAP,
      start: ZOOM,
      middle: PAGER,
      end: ZOOM,
    });
    expect(withMiddle.start.offset).toBe(PAGER.height + GAP);
    expect(withMiddle.end.offset).toBe(PAGER.height + GAP + ZOOM.height + GAP);
  });

  it('counts a column that draws nothing as no column', () => {
    const spots = arrangeEdgeRow({
      length: 250,
      gap: GAP,
      start: { width: 0, height: 0 },
      middle: PAGER,
      end: null,
    });
    expect(spots).toEqual({ start: AT_REST, middle: AT_REST, end: AT_REST });
  });
});

describe('arrangeSideRow', () => {
  it('keeps the start and end bars level while they fit side by side', () => {
    expect(arrangeSideRow({ length: 350, gap: GAP, start: ZOOM, middle: null, end: ZOOM })).toEqual(
      {
        start: AT_REST,
        middle: AT_REST,
        end: AT_REST,
      },
    );
  });

  it('puts the start bar over the end one when they would meet', () => {
    const tall = { width: 200, height: 60 };
    const spots = arrangeSideRow({ length: 350, gap: GAP, start: tall, middle: null, end: ZOOM });
    expect(spots.start).toEqual({ ...AT_REST, offset: ZOOM.height + GAP });
    expect(spots.end).toEqual({ ...AT_REST, offset: tall.height + GAP });
  });
});

describe('FLOATING_ROWS', () => {
  it('names every floating position once', () => {
    const positions = Object.values(FLOATING_ROWS).flatMap(({ start, middle, end }) =>
      [start, middle, end].filter((position) => position !== null),
    );
    expect(new Set(positions).size).toBe(8);
  });
});
