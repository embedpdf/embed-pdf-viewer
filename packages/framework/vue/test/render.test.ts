import { computed, h, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import { toPageRef } from '@embedpdf/core';
import type { AnyPlugin, CapabilityToken, DocumentHandle, Engine, PageRef } from '@embedpdf/core';
import { RenderToken } from '@embedpdf/plugin-render';
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
import { RenderLayer } from '../src/render';
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
  const keyOf = (page: PageRef, includeAnnotations = true) =>
    `page-${page.objectNumber}-${includeAnnotations ? 'with' : 'without'}`;
  const api = {
    getPaintSettings: () => ({ fadeMs: 0, tiles }),
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
      const url = `blob:${keyOf(page, options.includeAnnotations)}`;
      return Promise.resolve({
        objectUrl: () => ({ abortWith: () => Promise.resolve({ url, revoke: () => {} }) }),
      });
    },
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
  return { plugin, asked, demands, view, createViewDemand, replan, pictureAsks };
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
