import { flushSync } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/svelte';
import { toPageRef } from '@embedpdf/core';
import type { CapabilityToken } from '@embedpdf/core';
import type { PicturePainter, PictureReport } from '@embedpdf/plugin-render';
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

/** The page's whole-page picture: the layer's first <img>, the one tiles sit over. */
const basePicture = (container: HTMLElement) =>
  [...container.querySelectorAll('img')].find((image) => image.style.zIndex === '')!;

describe("the page's picture state", () => {
  it('reports the page loading in its view until the base picture presented, and closes with the layer', async () => {
    const render = fakeRender();
    const shown = signal(true);
    const { kernel, view } = await viewerWith(
      [render.plugin],
      TilePageView,
      { page: signal(0), shown },
      renderEngine(1).engine,
    );
    await kernel.documents.open(bytesInput('a'));
    flushSync();
    await waitFor(() =>
      expect(basePicture(view.container).getAttribute('src')).toBe('blob:page-1'),
    );
    expect(render.reports).toHaveLength(1);
    const report = render.reports[0]!;
    expect(report.page).toBe(1);
    expect(report.shown).toBe(0); // not loaded yet

    basePicture(view.container).dispatchEvent(new Event('load'));
    await waitFor(() => expect(report.shown).toBe(1)); // after a frame presented it

    shown.value = false;
    flushSync();
    expect(report.closed).toBe(true);
  });

  it('keeps its report through a zoom and a scroll: the camera moving is no new page', async () => {
    const render = fakeRender();
    const { kernel } = await viewerWith(
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
    await waitFor(() => expect(render.reports).toHaveLength(1));

    stage.zoomTo(4);
    flushSync();
    stage.scrollBy({ top: 600, behavior: 'instant' });
    flushSync();

    expect(render.reports).toHaveLength(1);
    expect(render.reports[0]!.closed).toBe(false);
  });

  it('fetches the page picture again only when its key moves, not with every camera frame', async () => {
    const render = fakeRender();
    const { kernel } = await viewerWith(
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
    await waitFor(() => expect(render.sourceAsks.count).toBeGreaterThan(0));
    const asked = render.sourceAsks.count;

    // The fake's key holds for the page at any zoom.
    stage.zoomTo(2);
    flushSync();
    for (let step = 0; step < 3; step++) {
      stage.scrollBy({ top: 40, behavior: 'instant' });
      flushSync();
    }

    expect(render.sourceAsks.count).toBe(asked);
  });

  it('reports a render that fails', async () => {
    const render = fakeRender();
    const refused = new Error('refused');
    render.failWith(refused);
    const { kernel } = await viewerWith(
      [render.plugin],
      TilePageView,
      { page: signal(0), shown: signal(true) },
      renderEngine(1).engine,
    );
    await kernel.documents.open(bytesInput('a'));
    flushSync();
    await waitFor(() => expect(render.reports[0]?.failed).toEqual([refused]));
    expect(render.reports[0]!.shown).toBe(0);
  });

  it("hands a painter the page's report, and closes it when the painter is given back", async () => {
    const render = fakeRender();
    const { kernel } = await viewerWith(
      [stagePlugin(), render.plugin],
      RenderHarness,
      {},
      renderEngine(1).engine,
    );
    await kernel.documents.open(bytesInput('a'));
    flushSync();
    const handed: PictureReport[] = [];
    const painter: PicturePainter = {
      paints: () => true,
      paint: (_host, _page, report) => {
        handed.push(report);
        return { update: () => {}, destroy: () => {} };
      },
    };
    render.handOver(painter);
    flushSync();
    kernel.capability(host).setViewportSize({ width: 800, height: 600 });
    flushSync();
    await waitFor(() => expect(handed).toHaveLength(1));
    const report = render.reports.find((entry) => !entry.closed)!;

    handed[0]!.shown();
    expect(report.shown).toBe(1);

    render.handOver(null);
    flushSync();
    expect(report.closed).toBe(true);
  });

  it('reads the state of the page it is drawn on, in its view', async () => {
    const render = fakeRender();
    const { kernel, view } = await viewerWith(
      [render.plugin],
      TilePageView,
      { page: signal(0), shown: signal(true), indicator: true },
      renderEngine(1).engine,
    );
    await kernel.documents.open(bytesInput('a'));
    flushSync();
    const indicator = () => view.container.querySelector('[data-testid="picture"]')?.textContent;
    await waitFor(() => expect(indicator()).toBe('idle'));
    const id = render.reports[0]!.view;

    render.setPictureState(id, 1, { status: 'loading', slow: true });
    flushSync();
    expect(indicator()).toBe('loading slow');
    render.setPictureState('another view', 1, { status: 'ready', slow: false });
    flushSync();
    expect(indicator()).toBe('loading slow');
  });
});
