import { describe, expect, it } from 'vitest';

import { renderPriority, screenFacts, type RenderPurpose } from '../src/priority';

/** Which render runs first, from the device pixels each view shows of each page. */

const PAGE = { width: 600, height: 800 };
// Two device pixels per point; `height` points of the page on screen.
const showing = (height: number) => ({
  desiredDeviceWidth: 1200,
  visibleRect: { x: 0, y: 0, width: 600, height },
});

describe('render priority', () => {
  const facts = screenFacts(
    [
      { page: 1, demand: showing(100) },
      { page: 2, demand: showing(500) }, // the focus
      { page: 3, demand: showing(300) },
      { page: 4, demand: showing(0) }, // placed, off screen
      // A thumbnail rail shows all of page 1, small.
      { page: 1, demand: { desiredDeviceWidth: 150 } },
    ],
    () => PAGE,
  );

  it('the focus page shows the most pixels; a page counts its largest view', () => {
    expect(facts.focus).toBe(2);
    expect(facts.pixels.get(1)).toBe(600 * 100 * 4); // the main view beats the rail's 150 × 200
    expect(facts.pixels.get(4)).toBe(0);
    expect(screenFacts([{ page: 4, demand: showing(0) }], () => PAGE).focus).toBeNull();
  });

  it('bands first, pixels on screen within a band; a page no view shows last', () => {
    const order: Array<[RenderPurpose, number]> = [
      ['base', 2],
      ['tile', 2],
      ['base', 3],
      ['base', 1],
      ['tile', 3],
      ['tile', 1],
      ['prefetch', 2],
      ['base', 4],
      ['base', 5],
    ];
    const priorities = order.map(([purpose, page]) => renderPriority(purpose, page, facts));
    expect(priorities).toEqual([...priorities].sort((a, b) => b - a));
    expect(new Set(priorities).size).toBe(priorities.length);
    expect(renderPriority('base', 5, facts)).toBe(0);
  });
});
