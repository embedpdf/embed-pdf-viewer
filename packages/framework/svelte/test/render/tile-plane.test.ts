import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/svelte';
import { toPageRef } from '@embedpdf/core';
import type { CapabilityToken } from '@embedpdf/core';
import type { StageHostCapability } from '@embedpdf/plugin-stage/contract/host';
import { stagePlugin, StageToken } from '../../src/stage';
import { bytesInput } from '../fixtures/counter-plugin';
import { fakeRender } from '../fixtures/fake-render';
import { renderEngine } from '../fixtures/render-engine';
import { signal } from '../fixtures/signal.svelte';
import RenderHarness from '../fixtures/RenderHarness.svelte';
import TilePageView from '../fixtures/TilePageView.svelte';
import { viewerWith } from '../fixtures/viewer';

/**
 * The tile plane holds the view's handle while the renderer and the view are the same, holds its
 * page's claim on it while the page is the same, and only sends a new demand when the camera
 * moves. Before, a zoom or a scroll released the page right after its new demand, and the tiles
 * went.
 */

const host = StageToken as unknown as CapabilityToken<StageHostCapability>;
const tiles = (container: HTMLElement) =>
  [...container.querySelectorAll('img')].filter((image) => image.style.zIndex !== '');

describe('the tile plane', () => {
  it('follows a zoom and a scroll with new demands, keeping the page and the view', async () => {
    const render = fakeRender();
    const { kernel, view } = await viewerWith(
      [stagePlugin(), render.plugin],
      RenderHarness,
      {},
      renderEngine(1).engine,
    );
    await kernel.documents.open(bytesInput('a'));
    flushSync();
    const stage = kernel.capability(host);
    stage.setViewportSize({ width: 800, height: 600 });
    flushSync();
    await waitFor(() => expect(tiles(view.container)).toHaveLength(1));
    const sent = render.demands.length;
    const before = render.demands.at(-1)!;

    stage.zoomTo(4);
    flushSync();
    stage.scrollBy({ top: 600, behavior: 'instant' });
    flushSync();

    const after = render.demands.slice(sent);
    expect(after.at(-1)!.width).toBeGreaterThan(before.width); // the zoom asked for more pixels
    expect(new Set(after.map((demand) => demand.visible)).size).toBeGreaterThan(1); // the scroll moved the visible part
    expect(render.view.release).not.toHaveBeenCalled();
    expect(render.view.dispose).not.toHaveBeenCalled();
    expect(render.createViewDemand).toHaveBeenCalledTimes(1);
    expect(tiles(view.container)).toHaveLength(1);
  });

  it('binds a tile once while a re-plan keeps it (the same picture, a new plan object)', async () => {
    const render = fakeRender();
    const { kernel, view } = await viewerWith(
      [stagePlugin(), render.plugin],
      RenderHarness,
      {},
      renderEngine(1).engine,
    );
    await kernel.documents.open(bytesInput('a'));
    flushSync();
    const stage = kernel.capability(host);
    stage.setViewportSize({ width: 800, height: 600 });
    flushSync();
    await waitFor(() => expect(tiles(view.container)).toHaveLength(1));
    const asked = render.pictureAsks();

    for (let step = 0; step < 3; step++) {
      render.replan();
      stage.scrollBy({ top: 40, behavior: 'instant' });
      flushSync();
    }

    expect(render.pictureAsks()).toBe(asked); // not bound again, so never hidden to reload
    expect(tiles(view.container)).toHaveLength(1);
  });

  it('in a page view given another page, lets go of the old page and plans the new one', async () => {
    const render = fakeRender();
    const page = signal(0);
    const shown = signal(true);
    const { kernel, view } = await viewerWith(
      [render.plugin],
      TilePageView,
      { page, shown },
      renderEngine(2).engine,
    );
    await kernel.documents.open(bytesInput('a'));
    flushSync();
    await waitFor(() => expect(tiles(view.container)).toHaveLength(1));
    expect(render.demands.at(-1)!.page).toBe(1);

    page.value = 1;
    flushSync();

    expect(render.view.release).toHaveBeenCalledTimes(1);
    expect(render.view.release).toHaveBeenCalledWith(toPageRef(1));
    expect(render.demands.at(-1)!.page).toBe(2);
    expect(render.view.dispose).not.toHaveBeenCalled();
    expect(render.createViewDemand).toHaveBeenCalledTimes(1);
    expect(tiles(view.container)).toHaveLength(1);
  });

  it('lets go of the page and the view when it goes', async () => {
    const render = fakeRender();
    const page = signal(0);
    const shown = signal(true);
    const { kernel, view } = await viewerWith(
      [render.plugin],
      TilePageView,
      { page, shown },
      renderEngine(1).engine,
    );
    await kernel.documents.open(bytesInput('a'));
    flushSync();
    await waitFor(() => expect(tiles(view.container)).toHaveLength(1));

    shown.value = false;
    flushSync();

    expect(render.view.release).toHaveBeenCalledWith(toPageRef(1));
    expect(render.view.dispose).toHaveBeenCalledTimes(1);
  });

  it('plans without what a layer on the page paints, from the first demand', async () => {
    const render = fakeRender();
    const { kernel, view } = await viewerWith(
      [render.plugin],
      TilePageView,
      { page: signal(0), shown: signal(true), painter: true },
      renderEngine(1).engine,
    );
    await kernel.documents.open(bytesInput('a'));
    flushSync();
    await waitFor(() => expect(tiles(view.container)).toHaveLength(1));
    const rest = { includeAnnotations: false, includeFormFields: true };
    expect(render.demands.map((demand) => demand.parts)).toEqual(render.demands.map(() => rest));
  });
});
