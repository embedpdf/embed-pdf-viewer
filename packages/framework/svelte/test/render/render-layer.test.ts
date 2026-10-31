import { flushSync } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/svelte';
import type { CapabilityToken } from '@embedpdf/core';
import type { StageHostCapability } from '@embedpdf/plugin-stage/contract/host';
import { RenderToken, renderPlugin, type PicturePage, type PicturePainter } from '../../src/render';
import { stagePlugin, StageToken } from '../../src/stage';
import { bytesInput } from '../fixtures/counter-plugin';
import { renderEngine } from '../fixtures/render-engine';
import RenderHarness from '../fixtures/RenderHarness.svelte';
import { viewerWith } from '../fixtures/viewer';

/**
 * `<RenderLayer>` on Stage pages: each visible page shows the picture the render plugin gives
 * for it, leaving out what a layer on the page paints, and an invalidation (a new epoch, so a new
 * source key) fetches and shows a new one, releasing the old URL.
 */

const host = StageToken as unknown as CapabilityToken<StageHostCapability>;

async function renderedStage(props: { annotations?: boolean; painter?: boolean } = {}) {
  const fake = renderEngine(2);
  const viewer = await viewerWith(
    [stagePlugin(), renderPlugin()],
    RenderHarness,
    props,
    fake.engine,
  );
  await viewer.kernel.documents.open(bytesInput('a'));
  flushSync();
  viewer.kernel.capability(host).setViewportSize({ width: 800, height: 1200 });
  flushSync();
  const sources = () =>
    [...viewer.view.container.querySelectorAll('img')].map((image) => image.getAttribute('src'));
  return { ...viewer, ...fake, sources };
}

describe('RenderLayer', () => {
  it('shows each visible page’s picture, with what the user may read', async () => {
    const { sources, renders } = await renderedStage();
    await waitFor(() => expect(sources().filter(Boolean).length).toBeGreaterThan(0));
    expect(sources()[0]).toMatch(/^blob:page-1-call-\d+$/);
    expect(renders[0]!.options).toMatchObject({
      includeAnnotations: true,
      includeFormFields: true,
    });
  });

  it('leaves out what a layer on the page paints, from the first request', async () => {
    const { sources, renders } = await renderedStage({ painter: true });
    await waitFor(() => expect(sources().filter(Boolean).length).toBeGreaterThan(0));
    expect(renders.every((call) => call.options.includeAnnotations === false)).toBe(true);
    expect(renders[0]!.options.includeFormFields).toBe(true);
  });

  it('leaves annotations out of the picture when asked', async () => {
    const { sources, renders } = await renderedStage({ annotations: false });
    await waitFor(() => expect(sources().filter(Boolean).length).toBeGreaterThan(0));
    expect(renders.every((call) => call.options.includeAnnotations === false)).toBe(true);
  });

  it('fetches again after an invalidation, and releases the old picture', async () => {
    const { kernel, sources, revoked } = await renderedStage();
    await waitFor(() => expect(sources()[0]).toBeTruthy());
    const before = sources()[0];
    kernel.capability(RenderToken).invalidate({ pages: [0] });
    flushSync();
    await waitFor(() => expect(sources()[0]).not.toBe(before));
    expect(revoked).toContain(before);
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
  return { painter, painted, updates, destroyed };
}

/** A Stage whose pictures `painter` was handed before the stage had its box. */
async function paintedStage(painter: PicturePainter<HTMLElement>) {
  const fake = renderEngine(2);
  const viewer = await viewerWith([stagePlugin(), renderPlugin()], RenderHarness, {}, fake.engine);
  await viewer.kernel.documents.open(bytesInput('a'));
  const giveBack = viewer.kernel.capability(RenderToken).handOverPictures(painter);
  flushSync();
  viewer.kernel.capability(host).setViewportSize({ width: 800, height: 1200 });
  flushSync();
  return { ...viewer, ...fake, giveBack };
}

describe('a plugin that paints the pictures', () => {
  it('is lent the page box, follows the zoom, and never lets the raster be fetched', async () => {
    const recording = recordingPainter();
    const { kernel, view, renders, giveBack } = await paintedStage(recording.painter);
    await waitFor(() => expect(recording.painted.length).toBeGreaterThan(0));

    expect(recording.painted[0]!.page).toBe(1);
    expect(recording.painted[0]!.host.isConnected).toBe(true);
    expect(view.container.querySelectorAll('img')).toHaveLength(0);
    expect(renders).toEqual([]);

    const painted = recording.painted.length;
    kernel.capability(host).zoomTo(2);
    flushSync();
    expect(recording.updates.at(-1)!.transform.viewScale).toBeGreaterThan(
      recording.painted[0]!.scale,
    );
    expect(recording.painted).toHaveLength(painted); // the same pictures, updated

    // Given back, the render plugin draws the pages again.
    giveBack();
    flushSync();
    expect(recording.destroyed).toHaveBeenCalledTimes(painted);
    await waitFor(() => expect(renders.length).toBeGreaterThan(0));
  });

  it('leaves the views it doesn’t paint to the render plugin', async () => {
    const recording = recordingPainter(() => false);
    const { renders } = await paintedStage(recording.painter);
    await waitFor(() => expect(renders.length).toBeGreaterThan(0));
    expect(recording.painted).toEqual([]);
  });
});
