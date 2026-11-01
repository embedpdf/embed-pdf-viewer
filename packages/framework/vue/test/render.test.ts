import { computed, h, ref } from 'vue';
import type { VNodeChild } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import { toPageRef } from '@embedpdf/core';
import type { AnyPlugin, CapabilityToken, DocumentHandle, Engine, PageRef } from '@embedpdf/core';
import {
  RenderToken,
  type PicturePage,
  type PicturePainter,
  type PictureReport,
  type PictureState,
} from '@embedpdf/plugin-render';
import type {
  PageLayerOptions,
  RenderHostCapability,
  RenderSourceOptions,
  TilePaintPlan,
  ViewDemand,
} from '@embedpdf/plugin-render/contract/host';
import type { StageHostCapability } from '@embedpdf/plugin-stage/contract/host';
import { usePaintsPagePart } from '../src/page-layers';
import { DocumentGate, usePage } from '../src/runtime';
import { PageView } from '../src/page-view';
import { RenderLayer, usePictureState } from '../src/render';
import { Stage, StageToken, stagePlugin } from '../src/stage';
import { bytesInput, probe, settle, until, viewerWith } from './counter-plugin';

/**
 * `<RenderLayer>` paints what the render plugin gives it: the page's picture,
 * asked for by its source key, and the tiles of the view's plan. A render
 * plugin of the test's own stands in for the real one. The tile plane holds
 * the view's handle while the renderer and the view are the same, holds its
 * page's claim while the page is the same, and only sends a new demand when
 * the camera moves.
 */

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

const IDLE: PictureState = { status: 'idle', slow: false };

/** A render plugin that answers every page with a picture named after its key, and one tile. */
function fakeRender({ tiles }: { tiles: boolean }) {
  /** Every picture asked for: the page and the parts it draws. */
  const asked: { page: PageRef; parts: PageLayerOptions }[] = [];
  /** Every demand the plane sends: the page, how wide it wants it, and the parts it draws. */
  const demands: { page: number; width: number; visible?: string; parts?: PageLayerOptions }[] = [];
  let plan: TilePaintPlan = { engaged: true, paint: [tile], fetching: [], stamp: 'one' };
  /** Plan again: the same tile, with the same picture, as a new object (as the plugin hands it). */
  const replan = () => {
    plan = { ...plan, paint: plan.paint.map((source) => ({ ...source })) };
  };
  const view: ViewDemand = {
    setDemand: (page, demand, parts) =>
      demands.push({
        page: page.objectNumber,
        width: demand.desiredDeviceWidth,
        visible: demand.visibleRect && JSON.stringify(demand.visibleRect),
        parts,
      }),
    getPlan: () => plan, // the same plan until it changes, as the plugin's
    markPainted: () => {},
    markUnpainted: () => {},
    release: vi.fn(),
    dispose: vi.fn(),
  };
  const createViewDemand = vi.fn(() => view);
  const rights = { annotations: true, formFields: true };
  let painter: PicturePainter | null = null;
  let notify = () => {};
  /** Every report a layer opened: on which page and view, and what it said. */
  const reports: {
    view: string;
    page: number;
    shown: number;
    failed: unknown[];
    closed: boolean;
  }[] = [];
  /** Make every whole-page render fail with this, or succeed again with `null`. */
  let failure: unknown = null;
  const failWith = (error: unknown) => {
    failure = error;
  };
  /** The picture states the fake answers, by `view:page`. */
  const states = new Map<string, PictureState>();
  const setPictureState = (view: string, page: number, state: PictureState) => {
    states.set(`${view}:${page}`, state);
    notify();
  };
  /** Hand the pictures to a painter, as `handOverPictures` does; `null` gives them back. */
  const handOver = (next: PicturePainter | null) => {
    painter = next;
    notify();
  };
  const keyOf = (page: PageRef, includeAnnotations = true) =>
    `page-${page.objectNumber}-${includeAnnotations ? 'with' : 'without'}`;
  const api = {
    getPicturePainter: () => painter,
    getPaintSettings: () => ({ tiles }),
    getLayerRights: () => rights,
    getSourceKey: (page: PageRef, options: { includeAnnotations?: boolean }) =>
      keyOf(page, options.includeAnnotations),
    renderSource: (page: PageRef, options: RenderSourceOptions) => {
      const {
        scale: _scale,
        view: _view,
        signal: _signal,
        ...parts
      } = options as RenderSourceOptions & { signal?: AbortSignal };
      asked.push({ page, parts });
      if (failure) return Promise.reject(failure);
      const url = `blob:${keyOf(page, options.includeAnnotations)}`;
      return Promise.resolve({
        objectUrl: () => ({ abortWith: () => Promise.resolve({ url, revoke: () => {} }) }),
      });
    },
    createViewDemand,
    reportPicture: (view: string, page: PageRef) => {
      const entry = {
        view,
        page: page.objectNumber,
        shown: 0,
        failed: [] as unknown[],
        closed: false,
      };
      reports.push(entry);
      return {
        shown: () => void (entry.shown += 1),
        failed: (error: unknown) => void entry.failed.push(error),
        close: () => void (entry.closed = true),
      };
    },
    getPictureState: (page: PageRef, view: string) =>
      states.get(`${view}:${page.objectNumber}`) ?? IDLE, // the same object while the same, as the plugin's
  } as unknown as RenderHostCapability;
  const plugin: AnyPlugin = {
    id: 'render',
    scope: 'document',
    token: RenderToken,
    create: (ctx) => {
      notify = () => ctx.notify();
      return { api };
    },
  };
  /** How often the tile's picture has been asked for: once per binding. */
  const pictureAsks = () =>
    (tile.handle as unknown as { objectUrl: { mock: { calls: unknown[] } } }).objectUrl.mock.calls.length;
  return {
    plugin,
    asked,
    demands,
    view,
    createViewDemand,
    replan,
    pictureAsks,
    handOver,
    reports,
    failWith,
    setPictureState,
  };
}

const box = { x: 0, y: 0, width: 600, height: 800 };
/** An engine whose documents have `pageCount` pages of 600 × 800 points. */
const engineWith = (pageCount: number) =>
  ({
    open: (input: { id?: string }) =>
      Promise.resolve({
        id: input.id ?? 'doc',
        events: { subscribe: () => () => {}, lastServerId: () => null },
        pages: {
          list: () =>
            Promise.resolve({
              pageCount,
              labels: [],
              pages: Array.from({ length: pageCount }, (_, index) => ({
                index,
                ref: toPageRef(index + 1),
                label: null,
                size: { width: 600, height: 800 },
                rotation: 0,
                userUnit: 1,
                boxes: { media: box, crop: box, bleed: box, trim: box, art: box },
                pdfCropBox: { left: 0, bottom: 0, right: 600, top: 800 },
              })),
            }),
        },
        security: { allows: () => true, allowsAnnotation: () => true },
        close: () => Promise.resolve(),
      } as unknown as DocumentHandle),
    destroy: () => Promise.resolve(),
  }) as unknown as Engine;
const engine = engineWith(1);

/** A layer that paints the page's annotations itself, as `<AnnotationLayer>` does. */
const AnnotationPainter = probe(() => {
  const page = usePage();
  usePaintsPagePart(
    computed(() => page.value.ref),
    'annotations',
  );
});

async function renderWith(
  render: AnyPlugin,
  layer: Record<string, unknown> = {},
  { painter = false }: { painter?: boolean } = {},
) {
  const viewer = await viewerWith(
    [stagePlugin(), render],
    () =>
      h(DocumentGate, null, () =>
        h(Stage, null, {
          page: () => [h(RenderLayer, layer), painter ? h(AnnotationPainter) : null],
        }),
      ),
    engine,
  );
  await viewer.kernel.documents.open(bytesInput('a'));
  await settle();
  viewer.kernel
    .capability(StageToken as unknown as CapabilityToken<StageHostCapability>)
    .setViewportSize({ width: 800, height: 600 });
  await settle();
  return viewer;
}

enableAutoUnmount(afterEach);

describe('RenderLayer', () => {
  it('shows the picture the plugin renders for the page, with what the user may read', async () => {
    const render = fakeRender({ tiles: false });
    const { wrapper } = await renderWith(render.plugin);
    await until(() => wrapper.find('img').attributes('src') !== undefined);
    expect(wrapper.find('img').attributes('src')).toBe('blob:page-1-with');
    expect(render.asked.map((ask) => ask.parts)).toEqual([
      { includeAnnotations: true, includeFormFields: true },
    ]);
  });

  it('leaves out what a layer on the page paints, from the first request', async () => {
    const render = fakeRender({ tiles: true });
    const { wrapper } = await renderWith(render.plugin, {}, { painter: true });
    await until(() => wrapper.findAll('img').length === 2);
    expect(wrapper.find('img').attributes('src')).toBe('blob:page-1-without');
    const rest = { includeAnnotations: false, includeFormFields: true };
    expect(render.asked.map((ask) => ask.parts)).toEqual([rest]);
    expect(render.demands.map((demand) => demand.parts)).toEqual(render.demands.map(() => rest));
  });

  it('lets the props decide', async () => {
    const render = fakeRender({ tiles: false });
    const { wrapper } = await renderWith(
      render.plugin,
      { annotations: true, formFields: false },
      { painter: true },
    );
    await until(() => wrapper.find('img').attributes('src') !== undefined);
    expect(render.asked.at(-1)!.parts).toEqual({
      includeAnnotations: true,
      includeFormFields: false,
    });
  });

  it('asks for the page’s thumbnail when it is one, and plans no tiles', async () => {
    const render = fakeRender({ tiles: true });
    const { wrapper } = await renderWith(render.plugin, { thumbnail: true });
    await until(() => wrapper.find('img').attributes('src') !== undefined);
    expect(render.asked.map((ask) => ask.parts)).toEqual([
      { thumbnail: true, includeAnnotations: true, includeFormFields: true },
    ]);
    expect(render.demands).toEqual([]);
    expect(wrapper.findAll('img')).toHaveLength(1);
  });

  it('paints the view’s tile plan above the picture, and lets go of it on unmount', async () => {
    const render = fakeRender({ tiles: true });
    const { wrapper } = await renderWith(render.plugin);
    await until(() => wrapper.findAll('img').length === 2);
    expect(render.demands.length).toBeGreaterThan(0);
    wrapper.unmount();
    expect(render.view.release).toHaveBeenCalledWith(toPageRef(1));
    expect(render.view.dispose).toHaveBeenCalledTimes(1);
  });

  it('follows a zoom and a scroll with new demands, keeping the page and the view', async () => {
    const render = fakeRender({ tiles: true });
    const { wrapper, kernel } = await renderWith(render.plugin);
    await until(() => wrapper.findAll('img').length === 2);
    const stage = kernel.capability(StageToken);
    const sent = render.demands.length;
    const before = render.demands.at(-1)!;

    stage.zoomTo(4);
    await settle();
    stage.scrollBy({ top: 600, behavior: 'instant' });
    await settle();

    const after = render.demands.slice(sent);
    expect(after.at(-1)!.width).toBeGreaterThan(before.width); // the zoom asked for more pixels
    expect(new Set(after.map((demand) => demand.visible)).size).toBeGreaterThan(1); // the scroll moved the visible part
    expect(render.view.release).not.toHaveBeenCalled();
    expect(render.view.dispose).not.toHaveBeenCalled();
    expect(render.createViewDemand).toHaveBeenCalledTimes(1);
    expect(wrapper.findAll('img')).toHaveLength(2); // the tile is still there
  });

  it('binds a tile once while a re-plan keeps it (the same picture, a new plan object)', async () => {
    const render = fakeRender({ tiles: true });
    const { wrapper, kernel } = await renderWith(render.plugin);
    await until(() => wrapper.findAll('img').length === 2);
    const stage = kernel.capability(StageToken);
    const asked = render.pictureAsks();

    for (let step = 0; step < 3; step++) {
      render.replan();
      stage.scrollBy({ top: 40, behavior: 'instant' });
      await settle();
    }

    expect(render.pictureAsks()).toBe(asked); // not bound again, so never hidden to reload
    expect(wrapper.findAll('img')).toHaveLength(2);
  });

  it('in a page view given another page, lets go of the old page and plans the new one', async () => {
    const render = fakeRender({ tiles: true });
    const page = ref(0);
    const { wrapper, kernel } = await viewerWith(
      [render.plugin],
      () => h(PageView, { page: page.value, width: 300 }, () => h(RenderLayer)),
      engineWith(2),
    );
    await kernel.documents.open(bytesInput('a'));
    await settle();
    await until(() => wrapper.findAll('img').length === 2);
    expect(render.demands.at(-1)!.page).toBe(1);

    page.value = 1;
    await settle();

    expect(render.view.release).toHaveBeenCalledTimes(1);
    expect(render.view.release).toHaveBeenCalledWith(toPageRef(1));
    expect(render.demands.at(-1)!.page).toBe(2);
    expect(render.view.dispose).not.toHaveBeenCalled();
    expect(render.createViewDemand).toHaveBeenCalledTimes(1);
    expect(wrapper.findAll('img')).toHaveLength(2);
  });
});

/** A painter that records what it's lent: the box and page it paints, its updates, its end. */
function recordingPainter(paints: (view: string) => boolean = () => true) {
  const painted: { host: HTMLElement; page: number; scale: number }[] = [];
  const updates: PicturePage[] = [];
  const destroyed = vi.fn();
  const painter: PicturePainter<HTMLElement> = {
    paints,
    paint: (host, page) => {
      painted.push({ host, page: page.ref.objectNumber, scale: page.transform.viewScale });
      return { update: (next) => updates.push(next), destroy: destroyed };
    },
  };
  return { painter: painter as PicturePainter, painted, updates, destroyed };
}

describe('a plugin that paints the pictures', () => {
  it('is lent the page box, follows the zoom, and never lets the raster be fetched', async () => {
    const render = fakeRender({ tiles: true });
    const recording = recordingPainter();
    const viewer = await viewerWith(
      [stagePlugin(), render.plugin],
      () => h(DocumentGate, null, () => h(Stage, null, { page: () => [h(RenderLayer)] })),
      engine,
    );
    await viewer.kernel.documents.open(bytesInput('a'));
    render.handOver(recording.painter);
    const stage = viewer.kernel.capability(
      StageToken as unknown as CapabilityToken<StageHostCapability>,
    );
    stage.setViewportSize({ width: 800, height: 600 });
    await until(() => recording.painted.length === 1);

    expect(recording.painted[0]!.page).toBe(1);
    expect(recording.painted[0]!.host.isConnected).toBe(true);
    expect(viewer.wrapper.findAll('img')).toHaveLength(0);
    expect(render.asked).toEqual([]);
    expect(render.createViewDemand).not.toHaveBeenCalled();

    stage.zoomTo(2);
    await settle();
    expect(recording.updates.at(-1)!.transform.viewScale).toBeGreaterThan(
      recording.painted[0]!.scale,
    );
    expect(recording.painted).toHaveLength(1); // the same picture, updated

    // Given back, the render plugin draws the page again.
    render.handOver(null);
    await settle();
    expect(recording.destroyed).toHaveBeenCalledTimes(1);
    await until(() => render.asked.length > 0);
  });

  it('leaves the views it doesn’t paint to the render plugin', async () => {
    const render = fakeRender({ tiles: false });
    const recording = recordingPainter(() => false);
    const { kernel } = await viewerWith(
      [render.plugin],
      () => h(PageView, { page: 0, width: 300 }, () => h(RenderLayer)),
      engine,
    );
    await kernel.documents.open(bytesInput('a'));
    render.handOver(recording.painter);
    await until(() => render.asked.length > 0);
    expect(recording.painted).toEqual([]);
  });
});

describe("the page's picture state", () => {
  /** A page view of the first page with a render layer, and what else is given. */
  const pageView =
    (...rest: (() => VNodeChild)[]) =>
    () =>
      h(PageView, { page: 0, width: 300 }, () => [h(RenderLayer), ...rest.map((child) => child())]);

  it('reports the page loading in its view until the base picture presented, and closes with the layer', async () => {
    const render = fakeRender({ tiles: false });
    const shown = ref(true);
    const page = pageView();
    const { wrapper, kernel } = await viewerWith(
      [render.plugin],
      () => (shown.value ? page() : null),
      engine,
    );
    await kernel.documents.open(bytesInput('a'));
    await until(() => wrapper.find('img').attributes('src') === 'blob:page-1-with');
    expect(render.reports).toHaveLength(1);
    const report = render.reports[0]!;
    expect(report.page).toBe(1);
    expect(report.shown).toBe(0); // not loaded yet

    wrapper.find('img').element.dispatchEvent(new Event('load'));
    await until(() => report.shown === 1); // after a frame presented it

    shown.value = false;
    await settle();
    expect(report.closed).toBe(true);
  });

  it('reports a render that fails', async () => {
    const render = fakeRender({ tiles: false });
    const refused = new Error('refused');
    render.failWith(refused);
    const { kernel } = await viewerWith([render.plugin], pageView(), engine);
    await kernel.documents.open(bytesInput('a'));
    await until(() => render.reports[0]?.failed.length === 1);
    expect(render.reports[0]!.failed).toEqual([refused]);
    expect(render.reports[0]!.shown).toBe(0);
  });

  it("hands a painter the page's report, and closes it when the painter is given back", async () => {
    const render = fakeRender({ tiles: false });
    const viewer = await viewerWith(
      [stagePlugin(), render.plugin],
      () => h(DocumentGate, null, () => h(Stage, null, { page: () => [h(RenderLayer)] })),
      engine,
    );
    await viewer.kernel.documents.open(bytesInput('a'));
    const handed: PictureReport[] = [];
    render.handOver({
      paints: () => true,
      paint: (_host, _page, report) => {
        handed.push(report);
        return { update: () => {}, destroy: () => {} };
      },
    });
    viewer.kernel
      .capability(StageToken as unknown as CapabilityToken<StageHostCapability>)
      .setViewportSize({ width: 800, height: 600 });
    await until(() => handed.length === 1);
    const report = render.reports.find((entry) => !entry.closed)!;

    handed[0]!.shown();
    expect(report.shown).toBe(1);

    render.handOver(null);
    await settle();
    expect(report.closed).toBe(true);
  });

  it('reads the state of the page it is drawn on, in its view', async () => {
    const render = fakeRender({ tiles: false });
    const Indicator = probe(() => {
      const picture = usePictureState();
      return () =>
        h(
          'span',
          { 'data-testid': 'picture' },
          `${picture.value.status}${picture.value.slow ? ' slow' : ''}`,
        );
    });
    const { kernel } = await viewerWith(
      [render.plugin],
      pageView(() => h(Indicator)),
      engine,
    );
    await kernel.documents.open(bytesInput('a'));
    const indicator = () => document.querySelector('[data-testid="picture"]')?.textContent;
    await until(() => indicator() === 'idle' && render.reports.length > 0);
    const view = render.reports[0]!.view;

    render.setPictureState(view, 1, { status: 'loading', slow: true });
    await settle();
    expect(indicator()).toBe('loading slow');
    render.setPictureState('another view', 1, { status: 'ready', slow: false });
    await settle();
    expect(indicator()).toBe('loading slow');
  });
});
