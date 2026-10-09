import { describe, expect, it } from 'vitest';

import { searchHighlightsOf } from '../src/search-highlights';

/** A page drawn at 2 px per point, shifted by (10, 20). */
const page = {
  toPixels: (point: { x: number; y: number }) => ({ x: point.x * 2 + 10, y: point.y * 2 + 20 }),
};

const upright = {
  upperLeft: { x: 1, y: 1 },
  upperRight: { x: 5, y: 1 },
  lowerRight: { x: 5, y: 3 },
  lowerLeft: { x: 1, y: 3 },
};
const turned = {
  upperLeft: { x: 0, y: 0 },
  upperRight: { x: 2, y: 2 },
  lowerRight: { x: 1, y: 3 },
  lowerLeft: { x: -1, y: 1 },
};

describe('searchHighlightsOf', () => {
  it('paints an upright line as a box and a turned one as its quad, keyed by match and line', () => {
    const hit = { start: 7, segments: [{ quad: upright }, { quad: turned }] };
    const pieces = searchHighlightsOf([hit], {
      active: null,
      page,
      color: 'yellow',
      activeColor: 'orange',
    });
    expect(pieces).toEqual([
      {
        key: '7:0',
        hit,
        active: false,
        fill: 'yellow',
        box: { left: 12, top: 22, width: 8, height: 4 },
        points: null,
      },
      {
        key: '7:1',
        hit,
        active: false,
        fill: 'yellow',
        box: null,
        points: '10,20 14,24 12,26 8,22',
      },
    ]);
  });

  it('fills the active match’s lines with the active color', () => {
    const first = { start: 0, segments: [{ quad: upright }] };
    const second = { start: 9, segments: [{ quad: upright }] };
    const pieces = searchHighlightsOf([first, second], {
      active: second,
      page,
      color: 'yellow',
      activeColor: 'orange',
    });
    expect(pieces.map((piece) => [piece.key, piece.active, piece.fill])).toEqual([
      ['0:0', false, 'yellow'],
      ['9:0', true, 'orange'],
    ]);
  });
});
