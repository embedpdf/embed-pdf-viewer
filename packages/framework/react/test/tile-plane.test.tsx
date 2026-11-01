// @vitest-environment happy-dom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, waitFor } from '@testing-library/react';
import { toPageRef } from '@embedpdf/core';
import type { AnyPlugin, CapabilityToken, DocumentHandle, Engine, PageRef } from '@embedpdf/core';
import { RenderToken, type PicturePage, type PicturePainter } from '@embedpdf/plugin-render';
import type {
  RenderHostCapability,
  RenderSourceOptions,
  TilePaintPlan,
  ViewDemand,
} from '@embedpdf/plugin-render/contract/host';
import type { StageHostCapability } from '@embedpdf/plugin-stage/contract/host';
import { PageView } from '../src/page-view';
import { usePaintsPagePart } from '../src/page-layers';
import { RenderLayer } from '../src/render';
import { DocumentGate, usePage } from '../src/runtime';
import { Stage, StageToken, stagePlugin } from '../src/stage';
import { bytesInput, viewerWith } from './counter-plugin';

/**
 * The tile plane holds the view's handle while the renderer and the view are the same, holds its
 * page's claim on it while the page is the same, and only sends a new demand when the camera
 * moves, and binds a tile again only for a new picture. The same checks run on every adapter.
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

/** A render plugin whose view's handle records what the tile plane does with it. */
function fakeRender() {
  /** Every demand the plane sends: the page, how wide it wants it, and the parts it draws. */
  const demands: { page: number; width: number; visible?: string; parts?: object }[] = [];
  /** The parts every whole-page picture is asked with. */
  const sources: object[] = [];
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
  const paint = { tiles: true };
  const rights = { annotations: true, formFields: true };
  let painter: PicturePainter | null = null;
  let notify = () => {};
  /** Hand the pictures to a painter, as `handOverPictures` does; `null` gives them back. */
  const handOver = (next: PicturePainter | null) => {
    painter = next;
    notify();
  };
  const api = {
    getPicturePainter: () => painter,
    getPaintSettings: () => paint,
    getLayerRights: () => rights,
    getSourceKey: (page: PageRef) => `page-${page.objectNumber}`,
    renderSource: (
      page: PageRef,
      {
        scale: _scale,
        view: _view,
        signal: _signal,
        ...parts
      }: RenderSourceOptions & { signal?: AbortSignal },
    ) => {
      sources.push(parts);
      return Promise.resolve({
        objectUrl: () => ({
          abortWith: () =>
            Promise.resolve({ url: `blob:page-${page.objectNumber}`, revoke: () => {} }),
        }),
      });
    },
    createViewDemand,
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
  return { plugin, demands, sources, view, createViewDemand, replan, pictureAsks, handOver };
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

const tiles = () =>
  [...document.querySelectorAll('img')].filter((image) => image.style.zIndex !== '');

afterEach(cleanup);

describe('the tile plane', () => {
  it('follows a zoom and a scroll with new demands, keeping the page and the view', async () => {
    const render = fakeRender();
    const { kernel } = await viewerWith(
      [stagePlugin(), render.plugin],
      <DocumentGate>
        <Stage>{() => <RenderLayer />}</Stage>
      </DocumentGate>,
      engineWith(1),
    );
    await act(() => kernel.documents.open(bytesInput('a')));
    const stage = kernel.capability(StageToken as unknown as CapabilityToken<StageHostCapability>);
    act(() => stage.setViewportSize({ width: 800, height: 600 }));
    await waitFor(() => expect(tiles()).toHaveLength(1));
    const sent = render.demands.length;
    const before = render.demands.at(-1)!;

    act(() => stage.zoomTo(4));
    act(() => stage.scrollBy({ top: 600, behavior: 'instant' }));

    const after = render.demands.slice(sent);
    expect(after.at(-1)!.width).toBeGreaterThan(before.width); // the zoom asked for more pixels
    expect(new Set(after.map((demand) => demand.visible)).size).toBeGreaterThan(1); // the scroll moved the visible part
    expect(render.view.release).not.toHaveBeenCalled();
    expect(render.view.dispose).not.toHaveBeenCalled();
    expect(render.createViewDemand).toHaveBeenCalledTimes(1);
    expect(tiles()).toHaveLength(1);
  });

  it('binds a tile once while a re-plan keeps it (the same picture, a new plan object)', async () => {
    const render = fakeRender();
    const { kernel } = await viewerWith(
      [stagePlugin(), render.plugin],
      <DocumentGate>
        <Stage>{() => <RenderLayer />}</Stage>
      </DocumentGate>,
      engineWith(1),
    );
    await act(() => kernel.documents.open(bytesInput('a')));
    const stage = kernel.capability(StageToken as unknown as CapabilityToken<StageHostCapability>);
    act(() => stage.setViewportSize({ width: 800, height: 600 }));
    await waitFor(() => expect(tiles()).toHaveLength(1));
    const asked = render.pictureAsks();

    for (let step = 0; step < 3; step++) {
      render.replan();
      act(() => stage.scrollBy({ top: 40, behavior: 'instant' }));
    }

    expect(render.pictureAsks()).toBe(asked); // not bound again, so never hidden to reload
    expect(tiles()).toHaveLength(1);
  });

  it('in a page view given another page, lets go of the old page and plans the new one', async () => {
    const render = fakeRender();
    const shown = (page: number) => (
      <PageView page={page} width={300}>
        <RenderLayer />
      </PageView>
    );
    const { kernel, rerender } = await viewerWith([render.plugin], shown(0), engineWith(2));
    await act(() => kernel.documents.open(bytesInput('a')));
    await waitFor(() => expect(tiles()).toHaveLength(1));
    expect(render.demands.at(-1)!.page).toBe(1);

    act(() => rerender(shown(1)));

    expect(render.view.release).toHaveBeenCalledTimes(1);
    expect(render.view.release).toHaveBeenCalledWith(toPageRef(1));
    expect(render.demands.at(-1)!.page).toBe(2);
    expect(render.view.dispose).not.toHaveBeenCalled();
    expect(render.createViewDemand).toHaveBeenCalledTimes(1);
    expect(tiles()).toHaveLength(1);

    // When it goes, it lets go of the page it shows now, and of the view.
    act(() => rerender(null));
    expect(render.view.release).toHaveBeenLastCalledWith(toPageRef(2));
    expect(render.view.dispose).toHaveBeenCalledTimes(1);
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
    const render = fakeRender();
    const { kernel } = await viewerWith(
      [stagePlugin(), render.plugin],
      <DocumentGate>
        <Stage>{() => <RenderLayer />}</Stage>
      </DocumentGate>,
      engineWith(1),
    );
    await act(() => kernel.documents.open(bytesInput('a')));
    const recording = recordingPainter();
    act(() => render.handOver(recording.painter));
    const stage = kernel.capability(StageToken as unknown as CapabilityToken<StageHostCapability>);
    act(() => stage.setViewportSize({ width: 800, height: 600 }));
    await waitFor(() => expect(recording.painted).toHaveLength(1));

    expect(recording.painted[0]!.page).toBe(1);
    expect(recording.painted[0]!.host.isConnected).toBe(true);
    expect(document.querySelectorAll('img')).toHaveLength(0);
    expect(render.sources).toEqual([]);
    expect(render.createViewDemand).not.toHaveBeenCalled();

    const before = recording.updates.length;
    act(() => stage.zoomTo(2));
    expect(recording.updates.length).toBeGreaterThan(before);
    expect(recording.updates.at(-1)!.transform.viewScale).toBeGreaterThan(
      recording.painted[0]!.scale,
    );
    expect(recording.painted).toHaveLength(1); // the same picture, updated

    // Given back, the render plugin draws the page again.
    act(() => render.handOver(null));
    expect(recording.destroyed).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(render.sources.length).toBeGreaterThan(0));
  });

  it('leaves the views it doesn’t paint to the render plugin', async () => {
    const render = fakeRender();
    const recording = recordingPainter(() => false);
    const { kernel } = await viewerWith(
      [render.plugin],
      <PageView page={0} width={300}>
        <RenderLayer />
      </PageView>,
      engineWith(1),
    );
    await act(() => kernel.documents.open(bytesInput('a')));
    act(() => render.handOver(recording.painter));
    await waitFor(() => expect(render.sources.length).toBeGreaterThan(0));
    expect(recording.painted).toEqual([]);
  });
});

/** A layer that paints the page's annotations itself, as `<AnnotationLayer>` does. */
function AnnotationPainter() {
  usePaintsPagePart(usePage().ref, 'annotations');
  return null;
}

describe('the parts the page picture draws', () => {
  it('leaves out what a layer mounted alongside paints, from the first request, and draws the rest', async () => {
    const render = fakeRender();
    const { kernel } = await viewerWith(
      [stagePlugin(), render.plugin],
      <DocumentGate>
        <Stage>
          {() => (
            <>
              <RenderLayer />
              <AnnotationPainter />
            </>
          )}
        </Stage>
      </DocumentGate>,
      engineWith(1),
    );
    await act(() => kernel.documents.open(bytesInput('a')));
    const stage = kernel.capability(StageToken as unknown as CapabilityToken<StageHostCapability>);
    act(() => stage.setViewportSize({ width: 800, height: 600 }));
    await waitFor(() => expect(render.sources.length).toBeGreaterThan(0));

    const rest = { includeAnnotations: false, includeFormFields: true };
    expect(render.sources).toEqual(render.sources.map(() => rest));
    expect(render.demands.map((demand) => demand.parts)).toEqual(render.demands.map(() => rest));
  });

  it('lets the props decide', async () => {
    const render = fakeRender();
    const { kernel } = await viewerWith(
      [stagePlugin(), render.plugin],
      <DocumentGate>
        <Stage>
          {() => (
            <>
              <RenderLayer formFields={false} />
              <AnnotationPainter />
            </>
          )}
        </Stage>
      </DocumentGate>,
      engineWith(1),
    );
    await act(() => kernel.documents.open(bytesInput('a')));
    const stage = kernel.capability(StageToken as unknown as CapabilityToken<StageHostCapability>);
    act(() => stage.setViewportSize({ width: 800, height: 600 }));
    await waitFor(() => expect(render.sources.length).toBeGreaterThan(0));

    expect(render.sources.at(-1)).toEqual({ includeAnnotations: false, includeFormFields: false });
  });

  it('draws a part again once the layer that painted it goes', async () => {
    const render = fakeRender();
    const shown = (painter: boolean) => (
      <PageView page={0} width={300}>
        <RenderLayer />
        {painter ? <AnnotationPainter /> : null}
      </PageView>
    );
    const { kernel, rerender } = await viewerWith([render.plugin], shown(true), engineWith(1));
    await act(() => kernel.documents.open(bytesInput('a')));
    await waitFor(() => expect(render.sources.length).toBeGreaterThan(0));
    expect(render.sources.at(-1)).toEqual({ includeAnnotations: false, includeFormFields: true });

    act(() => rerender(shown(false)));

    const everything = { includeAnnotations: true, includeFormFields: true };
    await waitFor(() => expect(render.sources.at(-1)).toEqual(everything));
    expect(render.demands.at(-1)!.parts).toEqual(everything);
  });
});
