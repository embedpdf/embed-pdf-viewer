/**
 * Where a job is on screen, and its rank: the call's priority first, then its
 * place, then the device pixels of its page there.
 */
import { describe, expect, test } from 'vitest';

import { toPageRef } from '../../src/identity/PageRef';
import type { WorkingSetPage } from '../../src/scheduling/facts';
import {
  clearlyOutranks,
  placeFor,
  placeIn,
  rank,
  type ViewSets,
} from '../../src/scheduling/place';

const shown = (page: number, entry: Omit<WorkingSetPage, 'page'>): WorkingSetPage => ({
  page: toPageRef(page),
  ...entry,
});

const views = (sets: Record<string, WorkingSetPage[]>): ViewSets =>
  new Map(
    Object.entries(sets).map(([view, pages]) => [
      view,
      new Map(pages.map((entry) => [entry.page.objectNumber, entry])),
    ]),
  );

describe('a job’s place', () => {
  const top = { x: 0, y: 0, width: 600, height: 400 };
  const entry = shown(1, { role: 'visible', visible: top, pixels: 900 });

  test('is its page’s role in the view, with the page’s pixels there', () => {
    expect(placeIn(entry, {})).toEqual({ place: 'visible', pixels: 900 });
    expect(placeIn(shown(1, { role: 'near', pixels: 0 }), {})).toEqual({
      place: 'near',
      pixels: 0,
    });
    expect(placeIn(undefined, {})).toEqual({ place: 'elsewhere', pixels: 0 });
  });

  test('is near for a part of a visible page that is off screen', () => {
    const below = { x: 0, y: 450, width: 100, height: 100 };
    const across = { x: 0, y: 350, width: 100, height: 100 };
    expect(placeIn(entry, { region: below })).toEqual({ place: 'near', pixels: 0 });
    expect(placeIn(entry, { region: across })).toEqual({ place: 'visible', pixels: 900 });
  });

  test('is in the view the job serves, or the best of every view showing its page', () => {
    const sets = views({
      stage: [shown(1, { role: 'visible', pixels: 900 })],
      rail: [shown(1, { role: 'visible', pixels: 30 }), shown(2, { role: 'near', pixels: 0 })],
    });
    const page = toPageRef(1);
    expect(placeFor({ page, view: 'rail' }, sets)).toEqual({ place: 'visible', pixels: 30 });
    expect(placeFor({ page }, sets)).toEqual({ place: 'visible', pixels: 900 });
    expect(placeFor({ page: toPageRef(2) }, sets)).toEqual({ place: 'near', pixels: 0 });
    expect(placeFor({ page: toPageRef(3) }, sets)).toEqual({ place: 'elsewhere', pixels: 0 });
    // A view that said nothing: the best of the others.
    expect(placeFor({ page, view: 'magnifier' }, sets)).toEqual({ place: 'visible', pixels: 900 });
  });

  test('is on screen for a job about the whole document, and for every job while no view says anything', () => {
    const sets = views({ stage: [shown(1, { role: 'near', pixels: 0 })] });
    expect(placeFor({}, sets)).toEqual({ place: 'visible', pixels: 0 });
    expect(placeFor({ page: toPageRef(1) }, new Map())).toEqual({ place: 'visible', pixels: 0 });
  });
});

describe('a job’s rank', () => {
  /** A tile's part of its page. */
  const part = { x: 0, y: 0, width: 100, height: 100 };
  const onScreen = (pixels: number) => ({ place: 'visible', pixels }) as const;
  const near = { place: 'near', pixels: 0 } as const;

  test('background last, then place, then priority, then a whole page before a part, then pixels', () => {
    // Landing on page 200, a sliver of 199 above, 201 just below: most urgent first.
    const order = [
      rank({ priority: 'high' }, onScreen(1_000_000)), // 200's base
      rank({ priority: 'high' }, onScreen(50_000)), // 199's base
      rank({ priority: 'high', region: part }, onScreen(1_000_000)), // 200's tiles
      rank({ priority: 'high', region: part }, onScreen(50_000)), // 199's tiles
      rank({ priority: 'auto' }, onScreen(1_000_000)), // 200's appearances, geometry, links
      rank({ priority: 'auto' }, onScreen(50_000)), // 199's
      rank({ priority: 'high' }, near), // 201's base
      rank({ priority: 'high', region: part }, near), // the ring's tiles
      rank({ priority: 'auto' }, near), // 201's geometry
      rank({ priority: 'auto' }, { place: 'elsewhere', pixels: 0 }), // a page no view shows
      rank({ priority: 'low' }, onScreen(0)), // a search scan
    ];
    expect([...order].sort((a, b) => b - a)).toEqual(order);
    expect(new Set(order).size).toBe(order.length);
  });

  test('a running job gives way to one that beats it on more than pixels', () => {
    const base = rank({ priority: 'high' }, onScreen(50_000));
    const tile = rank({ priority: 'high', region: part }, onScreen(1_000_000));
    const geometry = rank({ priority: 'auto' }, onScreen(1_000_000));
    const search = rank({ priority: 'low' }, onScreen(0));
    expect(clearlyOutranks(base, tile)).toBe(true); // another page's base over a tile
    expect(clearlyOutranks(tile, geometry)).toBe(true); // a picture over data
    expect(clearlyOutranks(geometry, search)).toBe(true); // anything shown over search
    expect(clearlyOutranks(rank({ priority: 'high' }, onScreen(900)), base)).toBe(false); // pixels alone
  });
});
