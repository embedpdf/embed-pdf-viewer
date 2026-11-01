/**
 * The plugin through the real kernel, render and stage plugins, on a fake engine: when it stays
 * off, and that a protected document is held one page at a time, with the pictures handed
 * over, before any view can reach it; then the player it was given shows the pages.
 */
import type { ModuleChannel } from '@cloudpdf/engine';
import { createKernel, toPageRef, type DocumentHandle, type Engine } from '@embedpdf/core';
import { renderPlugin, RenderToken, type PicturePage } from '@embedpdf/plugin-render';
import { RenderToken as RenderHostToken } from '@embedpdf/plugin-render/contract/host';
import { stagePlugin } from '@embedpdf/plugin-stage';
import { StageToken } from '@embedpdf/plugin-stage/contract/host';
import { describe, expect, it } from 'vitest';

import { protectedDisplayPlugin, ProtectedDisplayToken, type ProtectedDisplayConfig } from '../src';
import { fakeChannel, fakePlayer } from './helpers/module';

const box = { x: 0, y: 0, width: 600, height: 800 };

/** A document of three pages, with these permissions, on the cloud (with this module channel) or not. */
function engineFor({
  channel,
  allowed,
}: {
  channel: ModuleChannel | null;
  allowed: readonly string[];
}) {
  const handle = {
    id: 'doc',
    events: { subscribe: () => () => {}, lastServerId: () => null },
    pages: {
      list: () =>
        Promise.resolve({
          pageCount: 3,
          pages: [0, 1, 2].map((index) => ({
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
    security: {
      allows: (permission: string) => allowed.includes(permission),
      allowsAnnotation: () => false,
    },
    render: { getPolicy: () => Promise.resolve({ kind: 'continuous' }) },
    with() {
      return this;
    },
    setWorkingSet: () => {},
    close: () => Promise.resolve(),
    // What `cloudDocument()` reads: the module's routes.
    ...(channel
      ? {
          [Symbol.for('@cloudpdf/engine/cloud-document')]: {
            module: (id: string) => {
              expect(id).toBe('protected-display');
              return channel;
            },
          },
        }
      : {}),
  };
  return {
    open: () => Promise.resolve(handle as unknown as DocumentHandle),
    destroy: () => Promise.resolve(),
  } as unknown as Engine;
}

async function opened(options: {
  channel: ModuleChannel | null;
  allowed: readonly string[];
  config?: ProtectedDisplayConfig;
}) {
  const kernel = createKernel({
    engine: engineFor(options),
    plugins: [stagePlugin(), renderPlugin(), protectedDisplayPlugin(options.config)],
  });
  // Every state the views are told of, from the moment the stage can be reached.
  const seen: { flow: string; painted: boolean }[] = [];
  kernel.subscribe(() => {
    const stage = kernel.tryCapability(StageToken, 'doc');
    const render = kernel.tryCapability(RenderToken, 'doc');
    if (stage && render) {
      seen.push({ flow: stage.getSettings().flow, painted: render.getPicturePainter() !== null });
    }
  });
  await kernel.start();
  await kernel.documents.open({ kind: 'bytes', id: 'doc', bytes: new Uint8Array() });
  return {
    kernel,
    seen,
    status: () => kernel.capability(ProtectedDisplayToken, 'doc').getStatus(),
    stage: kernel.capability(StageToken, 'doc'),
    render: kernel.capability(RenderToken, 'doc'),
  };
}

const PROTECTED = ['doc.open', 'protected-display.view'];

describe('the protected display plugin', () => {
  it('stays off on the local engine, which has no server module', async () => {
    const { player } = fakePlayer();
    const { kernel, status, stage, render } = await opened({
      channel: null,
      allowed: PROTECTED,
      config: { player },
    });
    expect(status()).toEqual({ kind: 'off', reason: 'local-engine' });
    expect(stage.getLock('flow')).toBeNull();
    expect(render.getPicturePainter()).toBeNull();
    await kernel.destroy();
  });

  it('stays off for a user who may render the pages, and one without its permission', async () => {
    const { player } = fakePlayer();
    const { channel, requests } = fakeChannel();
    const renders = await opened({
      channel,
      allowed: [...PROTECTED, 'doc.render'],
      config: { player },
    });
    expect(renders.status()).toEqual({ kind: 'off', reason: 'may-render' });
    expect(renders.render.getPicturePainter()).toBeNull();
    await renders.kernel.destroy();

    const plain = await opened({ channel, allowed: ['doc.open'], config: { player } });
    expect(plain.status()).toEqual({ kind: 'off', reason: 'not-allowed' });
    expect(plain.stage.getLock('spread')).toBeNull();
    expect(requests).toEqual([]);
    await plain.kernel.destroy();
  });

  it('stays off without a player, and takes nothing over', async () => {
    const { channel, requests } = fakeChannel();
    const { kernel, status, stage, render } = await opened({ channel, allowed: PROTECTED });
    expect(status()).toEqual({ kind: 'off', reason: 'no-player' });
    expect(stage.getLock('flow')).toBeNull();
    expect(render.getPicturePainter()).toBeNull();
    expect(requests).toEqual([]);
    await kernel.destroy();
  });

  it('holds one page at a time, up to 500%, and has the pictures before any view can reach the stage', async () => {
    const { player } = fakePlayer();
    const { channel } = fakeChannel();
    const { kernel, seen, stage, render } = await opened({
      channel,
      allowed: PROTECTED,
      config: { player },
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((state) => state.flow === 'paged' && state.painted)).toBe(true);
    expect(stage.getSettings()).toMatchObject({ flow: 'paged', spread: 'none', maxZoom: 5 });
    expect(stage.getLock('spread')?.by).toBe('protected-display');
    expect(stage.getLock('maxZoom')?.by).toBe('protected-display');
    // It paints the main view's pages only.
    const painter = render.getPicturePainter()!;
    expect(painter.paints(stage.getLensId())).toBe(true);
    expect(painter.paints('thumbnails')).toBe(false);
    await kernel.destroy();
  });

  it('shows the pages with the DRM system the player has, and gives the pictures back as it closes', async () => {
    const { player, opened: screens } = fakePlayer(['widevine']);
    const { channel } = fakeChannel();
    const { kernel, status, render } = await opened({
      channel,
      allowed: PROTECTED,
      config: { player: () => Promise.resolve(player) },
    });
    await expect.poll(() => status().kind).toBe('showing');
    expect(status()).toEqual({
      kind: 'showing',
      keySystem: 'widevine',
      robustness: 'SW_SECURE_CRYPTO',
    });

    await kernel.documents.close('doc');
    expect(screens[0].screen.closed).toBe(true);
    expect(render.getPicturePainter()).toBeNull();
    await kernel.destroy();
  });

  it('says why when the server refuses the viewing session', async () => {
    const { player } = fakePlayer();
    const { channel, requests } = fakeChannel({
      refuse: { status: 403, body: 'no viewing sessions' },
    });
    const { kernel, status } = await opened({ channel, allowed: PROTECTED, config: { player } });
    await expect.poll(() => status().kind).toBe('failed');
    expect(requests.map((request) => request.path)).toEqual(['sessions']);
    expect(status()).toMatchObject({ message: expect.stringMatching(/403.*no viewing sessions/) });
    await kernel.destroy();
  });

  it('tells the render plugin a page waiting for its frame failed, so no indicator spins forever', async () => {
    const { player } = fakePlayer();
    const { channel } = fakeChannel({ refuse: { status: 403, body: 'no viewing sessions' } });
    const { kernel, status, stage } = await opened({
      channel,
      allowed: PROTECTED,
      config: { player },
    });
    const render = kernel.capability(RenderHostToken, 'doc');
    const view = stage.getLensId();
    const page = toPageRef(1);
    // The main view's page layer lends its box, with the page's report.
    const report = render.reportPicture(view, page);
    render
      .getPicturePainter()!
      .paint({}, { ref: page, pageIndex: 0, view } as unknown as PicturePage, report);
    expect(['loading', 'error']).toContain(render.getPictureState(page, view).status);

    await expect.poll(() => status().kind).toBe('failed');
    expect(render.getPictureState(page, view).status).toBe('error');
    await kernel.destroy();
  });
});
