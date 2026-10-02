import { describe, expect, test } from 'vitest';
import { toPageRef } from '@embedpdf/core';

import { revealOfDestination } from '../src/destination';

const page = toPageRef(12);
/** A us-letter page. Destinations are in page space: from its top-left, y down. */
const letter = { width: 612, height: 792 };

describe('a destination as a reveal', () => {
  test('xyz: a point from the top-left, with its zoom', () => {
    expect(revealOfDestination({ kind: 'xyz', page, x: 100, y: 92, zoom: 1.5 }, letter)).toEqual({
      rect: { x: 100, y: 92, width: 0, height: 0 },
      anchor: { x: 'start', y: 'start' },
      zoom: { level: 1.5 },
    });
  });

  test('xyz: a null axis keeps its place; a zoom of 0 keeps the zoom', () => {
    const reveal = revealOfDestination({ kind: 'xyz', page, x: null, y: 92, zoom: 0 }, letter);
    expect(reveal.anchor).toEqual({ x: 'keep', y: 'start' });
    expect(reveal.zoom).toBe('keep');
  });

  test('fit: the whole page', () => {
    expect(revealOfDestination({ kind: 'fit', page }, letter)).toEqual({ zoom: 'fit' });
  });

  test('fitH: a page-wide strip at y, fit to width', () => {
    expect(revealOfDestination({ kind: 'fitH', page, y: 92 }, letter)).toEqual({
      rect: { x: 0, y: 92, width: 612, height: 0 },
      zoom: 'fit-width',
      anchor: { y: 'start' },
    });
    expect(revealOfDestination({ kind: 'fitH', page }, letter).anchor).toEqual({ y: 'keep' });
  });

  test('fitV: a page-high strip at x, fit to height', () => {
    expect(revealOfDestination({ kind: 'fitV', page, x: 150 }, letter)).toEqual({
      rect: { x: 150, y: 0, width: 0, height: 792 },
      zoom: 'fit-height',
      anchor: { x: 'start' },
    });
  });

  test('fitR: the rect, fully fitted', () => {
    expect(
      revealOfDestination({ kind: 'fitR', page, x: 100, y: 92, width: 200, height: 200 }, letter),
    ).toEqual({ rect: { x: 100, y: 92, width: 200, height: 200 }, zoom: 'fit' });
  });

  test('the fitB kinds fit the whole page', () => {
    expect(revealOfDestination({ kind: 'fitB', page }, letter)).toEqual({
      rect: { x: 0, y: 0, width: 612, height: 792 },
      zoom: 'fit',
    });
    expect(revealOfDestination({ kind: 'fitBH', page, y: 92 }, letter).rect).toEqual({
      x: 0,
      y: 92,
      width: 612,
      height: 0,
    });
    expect(revealOfDestination({ kind: 'fitBV', page }, letter).anchor).toEqual({ x: 'keep' });
  });
});
