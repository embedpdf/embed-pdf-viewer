import { h, nextTick, shallowRef } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { Anchored, AnchoredScope } from '../src/anchored';
import type { AnchorTarget, ShownPages, ViewProjector } from '../src/anchored';

/**
 * `<Anchored>` on a page that isn't shown renders nothing and sits out every
 * camera frame; on a shown page it follows the camera, and shows nothing once
 * its box is out of view.
 */

const pageOf = (objectNumber: number) => ({ kind: 'objectNumber' as const, objectNumber });

/** A 400 × 300 surface that shows pages where their rects say, counting each projection. */
const surface = () => {
  const toScreen = vi.fn((_page: unknown, rect: { x: number; y: number; width: number; height: number }) => rect);
  const projector: ViewProjector = {
    space: 'overlay',
    toScreen,
    toScreenPoint: (_page, at) => at,
    viewEnv: () => ({ scale: 1, rotation: 0, zoom: 1 }),
    view: () => ({ x: 0, y: 0, width: 400, height: 300 }),
  };
  return { projector, toScreen };
};

/** Mounts `<Anchored>` and runs it through three camera frames, as the Stage's binding gives them. */
async function throughFrames(anchor: AnchorTarget) {
  const { projector, toScreen } = surface();
  const shown: ShownPages = new Set([1]);
  const frame = shallowRef(0);
  const wrapper = mount(
    () =>
      h(
        AnchoredScope,
        { binding: { projector, revision: frame.value }, shown },
        () => h(Anchored, { anchor, pinned: true }, () => h('span', { class: 'badge' }, '✓')),
      ),
    { attachTo: document.body },
  );
  await nextTick();
  const before = toScreen.mock.calls.length;
  for (const next of [1, 2, 3]) {
    frame.value = next;
    await nextTick();
  }
  return { projections: toScreen.mock.calls.length - before, badge: wrapper.find('.badge') };
}

enableAutoUnmount(afterEach);

describe('Anchored', () => {
  it('on a page that isn’t shown renders nothing, and sits out the camera frames', async () => {
    const { projections, badge } = await throughFrames({
      page: pageOf(2),
      bounds: { x: 100, y: 100, width: 50, height: 20 },
    });
    expect(badge.exists()).toBe(false);
    expect(projections).toBe(0);
  });

  it('on a shown page follows the camera', async () => {
    const { projections, badge } = await throughFrames({
      page: pageOf(1),
      bounds: { x: 100, y: 100, width: 50, height: 20 },
    });
    expect(badge.exists()).toBe(true);
    expect(projections).toBeGreaterThanOrEqual(3);
  });

  it('on a shown page shows nothing while its box is out of view', async () => {
    const { badge } = await throughFrames({
      page: pageOf(1),
      bounds: { x: 100, y: 900, width: 50, height: 20 },
    });
    expect(badge.exists()).toBe(false);
  });
});
