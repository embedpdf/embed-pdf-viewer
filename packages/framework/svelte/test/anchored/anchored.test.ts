import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import AnchoredSurface from '../fixtures/AnchoredSurface.svelte';

/**
 * `<Anchored>` on a page that isn't shown renders nothing and sits out every camera frame; on a
 * shown page it follows the camera, and shows nothing once its box is out of view.
 */

const pageOf = (objectNumber: number) => ({ kind: 'objectNumber' as const, objectNumber });

/** Mounts the badge, then moves the camera three frames. */
async function throughFrames(
  bounds: { x: number; y: number; width: number; height: number },
  page = 1,
) {
  const renders: unknown[] = [];
  const shown = new Set([1]);
  const anchor = { page: pageOf(page), bounds };
  const view = render(AnchoredSurface, { props: { frame: 0, shown, anchor, renders } });
  flushSync();
  const positions: (string | null)[] = [];
  const badge = () => view.container.querySelector('.badge')?.parentElement ?? null;
  for (const frame of [1, 2, 3]) {
    await view.rerender({ frame, shown, anchor, renders });
    flushSync();
    positions.push(badge()?.style.left ?? null);
  }
  return { renders, badge: view.container.querySelector('.badge'), positions };
}

describe('Anchored', () => {
  it('on a page that isn’t shown renders nothing', async () => {
    const { renders, badge } = await throughFrames({ x: 100, y: 100, width: 50, height: 20 }, 2);
    expect(badge).toBeNull();
    expect(renders).toHaveLength(0);
  });

  it('on a shown page is placed by the projection, and created once through the camera frames', async () => {
    const { renders, badge, positions } = await throughFrames({
      x: 100,
      y: 100,
      width: 50,
      height: 20,
    });
    expect(badge).not.toBeNull();
    expect(renders).toHaveLength(1);
    expect(positions.every((left) => left !== null)).toBe(true);
  });

  it('on a shown page shows nothing while its box is out of view', async () => {
    const { badge } = await throughFrames({ x: 100, y: 900, width: 50, height: 20 });
    expect(badge).toBeNull();
  });
});
