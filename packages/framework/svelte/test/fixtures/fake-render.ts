/**
 * A render plugin of a test's own: every page gets a picture named after its source key and a
 * one-tile plan, and the view's handle records what the tile plane does with it.
 */
import { vi } from 'vitest';
import type { AnyPlugin, PageRef } from '@embedpdf/core';
import { RenderToken } from '@embedpdf/plugin-render';
import type {
  RenderHostCapability,
  TilePaintPlan,
  ViewDemand,
} from '@embedpdf/plugin-render/contract/host';

const tile = {
  key: 'tile-1',
  scale: 2,
  rect: { x: 0, y: 0, width: 100, height: 100 },
  z: 1,
  handle: {
    objectUrl: vi.fn(() => ({
      abortWith: () => Promise.resolve({ url: 'blob:tile-1', revoke: () => {} }),
    })),
  } as never,
};

const task = <T>(value: T) => Object.assign(Promise.resolve(value), { abortWith: () => Promise.resolve(value) });

export function fakeRender() {
  /** Every demand the plane sends: the page and how wide it wants it. */
  const demands: { page: number; width: number; visible?: string }[] = [];
  let plan: TilePaintPlan = { engaged: true, paint: [tile], fetching: [], stamp: 'one' };
  /** Plan again: the same tile, with the same picture, as a new object (as the plugin hands it). */
  const replan = () => {
    plan = { ...plan, paint: plan.paint.map((source) => ({ ...source })) };
  };
  const view: ViewDemand = {
    setDemand: (page, demand) =>
      demands.push({
        page: page.objectNumber,
        width: demand.desiredDeviceWidth,
        visible: demand.visibleRect && JSON.stringify(demand.visibleRect),
      }),
    getPlan: () => plan, // the same plan until it changes, as the plugin's
    markPainted: () => {},
    markUnpainted: () => {},
    release: vi.fn(),
    dispose: vi.fn(),
  };
  const createViewDemand = vi.fn(() => view);
  const paint = { fadeMs: 0, tiles: true };
  const keyOf = (page: PageRef) => `page-${page.objectNumber}`;
  const api = {
    getPaintSettings: () => paint,
    getSourceKey: (page: PageRef) => keyOf(page),
    renderSource: (page: PageRef) =>
      Promise.resolve({ objectUrl: () => task({ url: `blob:${keyOf(page)}`, revoke: () => {} }) }),
    createViewDemand,
  } as unknown as RenderHostCapability;
  const plugin: AnyPlugin = {
    id: 'render',
    scope: 'document',
    token: RenderToken,
    create: () => ({ api }),
  };
  /** How often the tile's picture has been asked for: once per binding. */
  const pictureAsks = () =>
    (tile.handle as unknown as { objectUrl: { mock: { calls: unknown[] } } }).objectUrl.mock.calls.length;
  return { plugin, demands, view, createViewDemand, replan, pictureAsks };
}
